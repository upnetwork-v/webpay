function normalizeTLVDigitPair(input: string): string {
  return input.replace(/[Oo]/g, '0').replace(/[lLI]/g, '1');
}

function hasTLVStructure(value: string): boolean {
  return typeof value === 'string' && value.length >= 4;
}

/**
 * Check if a position in the string looks like a valid EMVCo TLV tag
 */
function isValidTLVTag(
  qrString: string,
  pos: number,
): {valid: boolean; tag?: string; length?: number; valueEnd?: number} {
  if (pos + 4 > qrString.length) {
    return {valid: false};
  }

  const rawTag = qrString.substring(pos, pos + 2);
  const rawLengthStr = qrString.substring(pos + 2, pos + 4);
  const tag = normalizeTLVDigitPair(rawTag);
  const lengthStr = normalizeTLVDigitPair(rawLengthStr);

  // Tag must be exactly 2 digits
  if (!/^\d{2}$/.test(tag)) {
    return {valid: false};
  }

  // Length must be exactly 2 digits (not just parseable)
  if (!/^\d{2}$/.test(lengthStr)) {
    return {valid: false};
  }

  const length = parseInt(lengthStr, 10);
  if (isNaN(length) || length < 0 || length > 999) {
    return {valid: false};
  }

  // Check if we have enough characters for the value
  const valueEnd = pos + 4 + length;
  if (valueEnd > qrString.length) {
    return {valid: false};
  }

  return {valid: true, tag, length, valueEnd};
}

/**
 * Find the next valid TLV tag starting from a given position
 * This is used for error recovery when encountering invalid data
 */
function findNextValidTag(
  qrString: string,
  startPos: number,
  maxSearch: number = 100,
): number | null {
  const endPos = Math.min(startPos + maxSearch, qrString.length - 3);
  for (let j = startPos; j <= endPos; j++) {
    const check = isValidTLVTag(qrString, j);
    if (check.valid) {
      return j;
    }
  }
  return null;
}

export function parseEMVCoQRCode(qrString: string): Record<string, string> {
  let i = 0;
  const result: Record<string, string> = {};

  if (!qrString || qrString.length < 4) {
    return result;
  }

  while (i < qrString.length) {
    // Check if current position is a valid TLV tag
    const currentCheck = isValidTLVTag(qrString, i);

    if (!currentCheck.valid) {
      // Current position is not valid, try to find next valid tag
      const nextPos = findNextValidTag(qrString, i + 1);
      if (nextPos !== null) {
        i = nextPos;
        continue;
      } else {
        // No valid tag found, stop parsing
        break;
      }
    }

    // We have a valid tag
    const tag = currentCheck.tag!;
    const length = currentCheck.length!;
    const valueEnd = currentCheck.valueEnd!;
    const tagStart = i; // Remember where this tag starts

    // Extract the value
    const value = qrString.substring(i + 4, valueEnd);
    result[tag] = value;

    // Move to next position
    i = valueEnd;

    // Verify that the next position looks like a valid tag
    // This helps detect cases where the length field might be incorrect
    if (i < qrString.length) {
      const nextCheck = isValidTLVTag(qrString, i);

      if (!nextCheck.valid && length > 0) {
        // Next position doesn't look valid, try adjusting current tag's length
        // This handles cases where length field is off by a few characters
        let foundValidNext = false;

        // Try adjusting length (both forward and backward, but prioritize backward)
        // Maximum adjustment: up to 50 characters or current length, whichever is smaller
        const maxAdjust = Math.min(50, length, qrString.length - i - 4);

        for (let adjust = 1; adjust <= maxAdjust; adjust++) {
          // Try backward adjustment first (most common case)
          // This means the length field was too large
          const backwardPos = i - adjust;
          if (backwardPos >= tagStart + 4) {
            // Make sure we don't go before the tag start
            const backwardCheck = isValidTLVTag(qrString, backwardPos);
            if (backwardCheck.valid) {
              // Found a valid tag with adjusted length
              const adjustedLength = length - adjust;
              const valueStart = tagStart + 4;
              const adjustedValue = qrString.substring(
                valueStart,
                valueStart + adjustedLength,
              );
              result[tag] = adjustedValue;
              i = backwardPos;
              foundValidNext = true;
              break;
            }
          }

          // Try forward adjustment (less common)
          const forwardPos = i + adjust;
          if (forwardPos + 4 <= qrString.length) {
            const forwardCheck = isValidTLVTag(qrString, forwardPos);
            if (forwardCheck.valid) {
              // Found a valid tag, but current length seems correct
              // This might be a case where there's extra data
              // Keep current value and move to forward position
              i = forwardPos;
              foundValidNext = true;
              break;
            }
          }
        }

        if (!foundValidNext) {
          // Couldn't find valid next tag with adjustment
          // Try to find any valid tag from current position
          const recoveryPos = findNextValidTag(qrString, i);
          if (recoveryPos !== null) {
            i = recoveryPos;
            continue;
          } else {
            // No recovery possible, stop parsing
            break;
          }
        }
      }
    }
  }

  return result;
}

function findPayNowNetworkDataFromParsed(
  parsed: Record<string, string>,
  sourceTag: string,
  visited: Set<string>,
  depth: number,
): {networkData: Record<string, string>; sourceTag: string} | null {
  if ((parsed['00'] || '').toUpperCase() === 'SG.PAYNOW') {
    return {networkData: parsed, sourceTag};
  }

  if (depth >= 5) {
    return null;
  }

  for (const value of Object.values(parsed)) {
    if (!hasTLVStructure(value)) {
      continue;
    }

    const cacheKey = `${sourceTag}:${depth}:${value}`;
    if (visited.has(cacheKey)) {
      continue;
    }
    visited.add(cacheKey);

    const nested = parseEMVCoQRCode(value);
    if (Object.keys(nested).length === 0) {
      continue;
    }

    const found = findPayNowNetworkDataFromParsed(
      nested,
      sourceTag,
      visited,
      depth + 1,
    );
    if (found) {
      return found;
    }
  }

  return null;
}

function findPayNowNetworkData(
  emvData: Record<string, string>,
): {networkData: Record<string, string>; sourceTag: string} | null {
  const visited = new Set<string>();
  const sortedKeys = Object.keys(emvData).sort();

  for (const tag of sortedKeys) {
    if (!/^\d{2}$/.test(tag)) {
      continue;
    }

    const tagNumber = Number(tag);
    // Merchant account information template tags range from 26-51 per EMVCo spec
    if (tagNumber < 26 || tagNumber > 51) {
      continue;
    }

    const value = emvData[tag];
    if (!hasTLVStructure(value)) {
      continue;
    }

    const parsed = parseEMVCoQRCode(value);
    if (Object.keys(parsed).length === 0) {
      continue;
    }

    const found = findPayNowNetworkDataFromParsed(parsed, tag, visited, 0);
    if (found) {
      return found;
    }
  }

  return null;
}

export function isLikelyPayNowQR(qrData: string): boolean {
  const paynowAIDRegex = /A000000727/;
  const sgDomainRegex = /SG\.PAYNOW/;
  const countryCodeRegex = /5802SG/;
  const crcRegex = /6304[a-fA-F0-9]{4}/;

  return (
    (paynowAIDRegex.test(qrData) || sgDomainRegex.test(qrData)) &&
    countryCodeRegex.test(qrData) &&
    crcRegex.test(qrData)
  );
}

/**
 * PayNow QR code parsing result interface
 */
export interface PayNowQRData {
  // Proxy info
  proxyType: 'phone' | 'nric' | 'uen' | 'unknown';
  proxyTypeCode: string; // Original code: 0, 2, 4
  proxyValue: string; // Phone number, NRIC/FIN, or UEN

  // Payment info (optional)
  amount?: string; // Transaction amount
  currency?: string; // Currency code (usually SGD)
  referenceId?: string; // Reference/Order number
  description?: string; // Description

  // Merchant info (optional)
  merchantName?: string;
  merchantCity?: string;
  countryCode?: string; // Usually 'SG'

  // Raw data
  rawData: Record<string, string>; // All parsed raw fields
  networkSpecificData: Record<string, string>; // Data inside Tag 26
}

/**
 * Parse a PayNow QR code and extract all key information
 * @param qrString PayNow QR code string
 * @returns Parsed structured data
 */
export function parsePayNowQR(qrString: string): PayNowQRData | null {
  if (!qrString || !isLikelyPayNowQR(qrString)) {
    return null;
  }

  // Parse outer EMVCo fields
  const emvData = parseEMVCoQRCode(qrString);

  // Locate PayNow network data inside merchant account information
  const payNowDataResult = findPayNowNetworkData(emvData);
  if (!payNowDataResult) {
    return null;
  }

  const {networkData} = payNowDataResult;

  // Extract Proxy Type and Proxy Value
  const proxyTypeCode =
    networkData['01'] ||
    networkData['10'] ||
    networkData['11'] ||
    networkData['12'] ||
    '';
  const proxyValue =
    networkData['02'] ||
    networkData['11'] ||
    networkData['12'] ||
    networkData['13'] ||
    '';

  // Determine Proxy Type
  let proxyType: 'phone' | 'nric' | 'uen' | 'unknown' = 'unknown';
  if (proxyTypeCode === '0') {
    proxyType = 'phone';
  } else if (proxyTypeCode === '2') {
    proxyType = 'nric';
  } else if (proxyTypeCode === '4') {
    proxyType = 'uen';
  }

  if (proxyType === 'unknown' && proxyValue) {
    const cleanProxyValue = proxyValue.replace(/[^a-zA-Z0-9]/g, '');
    if (/^(65)?[689]\d{7}$/.test(cleanProxyValue)) {
      proxyType = 'phone';
    } else if (
      /^(19|20)\d{2}[A-Z]{1}\d{4}[A-Z0-9]{1}$/.test(cleanProxyValue) ||
      /^[STFG][0-9]{7}[A-Z]$/.test(cleanProxyValue) ||
      /^[A-Z0-9]{8,}$/i.test(cleanProxyValue)
    ) {
      proxyType = 'uen';
    }
  }

  // Parse Tag 03 (optional, may contain amount, reference, etc.)
  // Tag 03 may be TLV format or direct data
  const optionalDataStr = networkData['03'];
  let amount: string | undefined;
  let referenceId: string | undefined;
  let description: string | undefined;

  if (optionalDataStr) {
    // Try to parse as TLV format
    try {
      const optionalData = parseEMVCoQRCode(optionalDataStr);
      // If parsing succeeds and has data, it is in TLV format
      if (Object.keys(optionalData).length > 0) {
        // According to PayNow spec, Tag 03 fields:
        // - may contain amount, reference, etc.
        // Concrete tag labels may vary between implementations
        amount = optionalData['01'] || optionalData['54']; // Try multiple possible tags
        referenceId = optionalData['05'] || optionalData['62']; // Reference
        description = optionalData['06'] || optionalData['59']; // Description
      }
    } catch (e) {
      // If not TLV, it may be direct data
      // In some implementations, Tag 03 may directly contain amount or other info
    }
  }

  // Extract amount from outer EMVCo data (Tag 54)
  // The amount is usually in cents, needs conversion to dollars (divide by 100)
  if (!amount && emvData['54']) {
    const amountInCents = emvData['54'];
    // Convert to dollars (if it has decimal, it is already in dollars; else it is in cents)
    if (amountInCents && !amountInCents.includes('.')) {
      amount = (parseInt(amountInCents, 10) / 100).toFixed(2);
    } else {
      amount = amountInCents;
    }
  }

  // Extract currency code (Tag 53)
  const currency = emvData['53'] || 'SGD';

  // Extract merchant name (Tag 59)
  const merchantName = emvData['59'];

  // Extract merchant city (Tag 60)
  const merchantCity = emvData['60'];

  // Extract country code (Tag 58)
  const countryCode = emvData['58'] || 'SG';

  // Parse Tag 62 (additional data field template)
  // Tag 62 is also TLV, may contain reference id, etc.
  const additionalDataStr = emvData['62'];
  if (additionalDataStr && !referenceId) {
    const additionalData = parseEMVCoQRCode(additionalDataStr);
    // Try extracting reference id from additional data
    // Common tags: '01', '05', '10', etc.
    referenceId =
      additionalData['01'] ||
      additionalData['05'] ||
      additionalData['10'] ||
      additionalData['RF'];
  }

  return {
    proxyType,
    proxyTypeCode,
    proxyValue,
    amount,
    currency,
    referenceId,
    description,
    merchantName,
    merchantCity,
    countryCode,
    rawData: emvData,
    networkSpecificData: networkData,
  };
}

export function isPhoneNumberOrUEN(input: string): 'phone' | 'uen' | 'invalid' {
  // Remove all non-alphanumeric characters for validation
  const cleanInput = input.replace(/[^a-zA-Z0-9]/g, '');

  // Singapore Phone Number patterns
  // +65 8xxx xxxx, +65 9xxx xxxx, +65 6xxx xxxx
  const phoneRegex = /^(65)?[689]\d{7}$/;

  // UEN (Unique Entity Number) patterns
  // Multiple formats supported:
  // 1. YYYYNNNNNNNNNNNNN (Year + 15 digits)
  // 2. TYYNNNNNNNNNNNNN (Business + Year + 15 digits)
  // 3. SYYNNNNNNNNNNNNN (Local Company + Year + 15 digits)
  // 4. YYYYNNNNNNNNNNNNNNNN (Year + 19 digits)
  // 5. YYYYNNNNNNNNNNNNNNNNNNNN (Year + 22 digits)
  // 6. YYYYNNNNNNNNNNNNNNNNNNNNNNNN (Year + 26 digits)
  const uenRegex = /^(19|20)\d{2}[TNS]?\d{9,26}$|^[TNS]\d{2}\d{9,26}$/;

  // Debug logging
  // console.log('UEN Check:', {
  //   input,
  //   cleanInput,
  //   length: cleanInput.length,
  //   phoneMatch: phoneRegex.test(cleanInput),
  //   uenMatch: uenRegex.test(cleanInput),
  // });

  if (phoneRegex.test(cleanInput)) {
    return 'phone';
  }

  // if (uenRegex.test(cleanInput)) {
  return 'uen';
  // }

  // return 'invalid';
}
