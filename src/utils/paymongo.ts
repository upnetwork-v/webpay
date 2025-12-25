import { parseEMVCoQRCode } from './paynow'

/**
 * Check if a value has TLV structure
 */
function hasTLVStructure(value: string): boolean {
  return typeof value === 'string' && value.length >= 4
}

/**
 * Check if a QR code string is likely a PayMongo code
 * PayMongo uses EMVCo standard with Philippines-specific identifiers
 */
export function isLikelyPayMongo(qrData: string): boolean {
  if (!qrData || qrData.length < 4) {
    return false
  }

  // Parse EMVCo data to check for Philippines-specific fields
  const emvData = parseEMVCoQRCode(qrData)

  // Check for Philippines country code (Tag 58)
  const countryCode = emvData['58']
  const isPhilippines = countryCode === 'PH'

  // Check for PHP currency (Tag 53)
  const currency = emvData['53']
  const isPHP = currency === 'PHP'

  // Check for PayMongo network identifier in merchant account information
  // PayMongo may have specific network identifiers in tags 26-51
  let hasPayMongoNetwork = false
  for (let tag = 26; tag <= 51; tag++) {
    const tagStr = tag.toString().padStart(2, '0')
    const value = emvData[tagStr]
    if (
      value &&
      (value.includes('PAYMONGO') ||
        value.includes('PH') ||
        value.includes('PayMongo'))
    ) {
      hasPayMongoNetwork = true
      break
    }
  }

  // PayMongo typically has Philippines country code and PHP currency
  return (isPhilippines || isPHP) && hasTLVStructure(qrData)
}

/**
 * Find PayMongo network data from parsed EMVCo data
 */
function findPayMongoNetworkData(
  emvData: Record<string, string>
): { networkData: Record<string, string>; sourceTag: string } | null {
  const sortedKeys = Object.keys(emvData).sort()

  // Check if this is a PayMongo (PH country code and PHP currency)
  const countryCode = emvData['58']
  const currency = emvData['53']
  const isPayMongo = countryCode === 'PH' || currency === 'PHP'

  for (const tag of sortedKeys) {
    if (!/^\d{2}$/.test(tag)) {
      continue
    }

    const tagNumber = Number(tag)
    // Merchant account information template tags range from 26-51 per EMVCo spec
    // Also check Tag 38 which is commonly used
    if ((tagNumber < 26 || tagNumber > 51) && tagNumber !== 38) {
      continue
    }

    const value = emvData[tag]
    if (!hasTLVStructure(value)) {
      continue
    }

    const parsed = parseEMVCoQRCode(value)
    if (Object.keys(parsed).length === 0) {
      continue
    }

    // For PayMongo, if we have PH country code and PHP currency,
    // accept any merchant account information tag that contains account data
    if (isPayMongo) {
      // Check if this contains account information (Tag 01 typically contains account number)
      if (parsed['01'] || parsed['02'] || parsed['00']) {
        return { networkData: parsed, sourceTag: tag }
      }
    }

    // Also check for explicit PayMongo indicators
    const hasPayMongoIndicator = Object.values(parsed).some(
      (v) =>
        v.includes('PAYMONGO') || v.includes('PayMongo') || v.includes('PH')
    )

    if (hasPayMongoIndicator) {
      return { networkData: parsed, sourceTag: tag }
    }
  }

  return null
}

export interface PayMongoCodeData {
  entityType: 'individual' | 'corporate'
  entityValue: string
  currency: string
  value: number
  country: string
  accountType: string
  purpose: string
  remark: string
}

/**
 * Parse a PayMongo QR code and extract information
 * Returns data compatible with PayMongoCodeData type
 */
export function parsePayMongo(qrString: string): PayMongoCodeData | null {
  if (!qrString || !isLikelyPayMongo(qrString)) {
    return null
  }

  // Parse outer EMVCo fields
  const emvData = parseEMVCoQRCode(qrString)

  // Try to find PayMongo network data
  const payMongoDataResult = findPayMongoNetworkData(emvData)
  const networkData = payMongoDataResult?.networkData || {}

  // Extract entity value (account number/mobile number) from network data
  // PayMongo typically stores account info in tags like '01', '02', '03', etc.
  let entityValue =
    networkData['01'] ||
    networkData['02'] ||
    networkData['03'] ||
    networkData['04'] ||
    ''

  // If Tag 01 contains a long string (like GUID format), extract the account number
  // Philippines mobile numbers are typically 11 digits starting with 09
  // Bank account numbers can vary in length
  if (entityValue && entityValue.length > 11) {
    // Try to extract mobile number (11 digits starting with 09)
    const mobileMatch = entityValue.match(/(09\d{9})/)
    if (mobileMatch) {
      entityValue = mobileMatch[1]
    } else {
      // Try to extract any account number pattern (10-15 digits)
      const accountMatch = entityValue.match(/(\d{10,15})$/)
      if (accountMatch) {
        entityValue = accountMatch[1]
      }
    }
  }

  // Fallback to merchant name if no account found
  if (!entityValue) {
    entityValue = emvData['59'] || ''
  }

  // Determine entity type (individual vs corporate)
  let entityType: 'individual' | 'corporate' = 'individual'
  const entityTypeIndicator = networkData['00'] || networkData['01']
  if (
    entityTypeIndicator &&
    (entityTypeIndicator.includes('CORP') ||
      entityTypeIndicator.includes('corporate'))
  ) {
    entityType = 'corporate'
  }

  // Extract currency (Tag 53)
  const currency = emvData['53'] || 'PHP'

  // Extract amount (Tag 54) - convert to number
  let value = 0
  if (emvData['54']) {
    const amountStr = emvData['54']
    if (amountStr && !amountStr.includes('.')) {
      value = parseInt(amountStr, 10)
    } else {
      value = parseFloat(amountStr) || 0
    }
  }

  // Extract country code (Tag 58)
  const country = emvData['58'] || 'PH'

  // Account type
  const accountType = networkData['02'] || 'ACCOUNT_NUMBER'

  // Purpose (e.g., PERSONAL_REMITTANCE)
  const purpose =
    networkData['03'] || networkData['06'] || 'PERSONAL_REMITTANCE'

  // Remark/description
  const remark =
    emvData['62'] ||
    networkData['04'] ||
    networkData['07'] ||
    emvData['59'] ||
    ''

  // Validate that we have at least entityValue
  if (!entityValue) {
    return null
  }

  return {
    entityType,
    entityValue,
    currency,
    value,
    country,
    accountType,
    purpose,
    remark,
  }
}
