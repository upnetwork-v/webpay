import OntaPayLogo from '@/assets/img/OntapayLogo.png'
import { isLikelyPayNowQR, parsePayNowQR } from '@/utils/paynow'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Html5Qrcode } from 'html5-qrcode'
import { useEffect, useRef, useState } from 'react'

export const Route = createFileRoute('/wallet/scan')({
  component: ScanPageComponent,
})

function ScanPageComponent() {
  const navigate = useNavigate()
  const [error, setError] = useState<string>('')
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null)
  const scannerDivId = 'qr-reader'

  useEffect(() => {
    startScanning()

    return () => {
      stopScanning()
    }
  }, [])

  const startScanning = async () => {
    try {
      const html5QrCode = new Html5Qrcode(scannerDivId)
      html5QrCodeRef.current = html5QrCode

      await html5QrCode.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        onScanSuccess,
        onScanFailure
      )
    } catch (err) {
      console.error('Failed to start scanner:', err)
      setError('无法启动摄像头，请检查权限设置')
    }
  }

  const stopScanning = async () => {
    if (html5QrCodeRef.current?.isScanning) {
      try {
        await html5QrCodeRef.current.stop()
        html5QrCodeRef.current.clear()
      } catch (err) {
        console.error('Failed to stop scanner:', err)
      }
    }
  }

  const onScanSuccess = (decodedText: string) => {
    console.log('QR scanned:', decodedText)

    // Check if it's a PayNow QR code
    if (!isLikelyPayNowQR(decodedText)) {
      setError('暂不支持此类型二维码')
      return
    }

    // Parse PayNow QR
    const payNowData = parsePayNowQR(decodedText)
    if (!payNowData) {
      setError('无法解析二维码')
      return
    }

    // Stop scanning and navigate to payment page
    stopScanning()
    navigate({
      to: '/wallet/pay/paynow',
      state: {
        payNowData,
      } as any, // Type assertion needed for router state
    })
  }

  const onScanFailure = (errorMessage: string) => {
    // Silently ignore scan failures (continuous scanning)
    console.debug('Scan failure:', errorMessage)
  }

  const handleCancel = () => {
    stopScanning()
    navigate({ to: '/wallet' })
  }

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-black">
      {/* Camera View */}
      <div
        id={scannerDivId}
        className="absolute inset-0"
        style={{
          width: '100vw',
          height: '100vh',
        }}
      />

      {/* Overlay mask - semi-transparent areas outside scan box */}
      <div className="pointer-events-none absolute inset-0 z-10">
        {/* Top overlay */}
        <div className="h-[35vh] w-full bg-black/50" />

        {/* Middle row with scan box */}
        <div className="flex h-[250px]">
          <div className="flex-1 bg-black/50" />
          <div className="w-[250px]" />
          <div className="flex-1 bg-black/50" />
        </div>

        {/* Bottom overlay */}
        <div className="flex-1 bg-black/50" />
      </div>

      {/* Header with Logo and Close Button */}
      <div className="absolute top-12 right-0 left-0 z-20 flex items-center justify-center px-6">
        <img src={OntaPayLogo} alt="OntaPay" className="h-8 w-auto" />

        {/* Close Button */}
        <button
          onClick={handleCancel}
          className="absolute right-6 flex h-10 w-10 items-center justify-center rounded-full bg-white/20 transition-all hover:bg-white/30"
          aria-label="Close"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 30 30"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M9.92188 20.4531C9.79167 20.3229 9.70573 20.1719 9.66406 20C9.6224 19.8229 9.6224 19.6484 9.66406 19.4766C9.70573 19.3047 9.78906 19.1562 9.91406 19.0312L13.5781 15.3672L9.91406 11.7109C9.78906 11.5859 9.70573 11.4375 9.66406 11.2656C9.6224 11.0938 9.6224 10.9219 9.66406 10.75C9.70573 10.5729 9.79167 10.4193 9.92188 10.2891C10.0469 10.1641 10.1953 10.0807 10.3672 10.0391C10.5443 9.99219 10.7188 9.99219 10.8906 10.0391C11.0677 10.0807 11.2188 10.1615 11.3438 10.2812L15 13.9453L18.6641 10.2891C18.7891 10.1641 18.9349 10.0807 19.1016 10.0391C19.2734 9.99219 19.4453 9.99219 19.6172 10.0391C19.7943 10.0807 19.9453 10.1667 20.0703 10.2969C20.2057 10.4219 20.2943 10.5729 20.3359 10.75C20.3776 10.9219 20.3776 11.0938 20.3359 11.2656C20.2943 11.4375 20.2083 11.5859 20.0781 11.7109L16.4297 15.3672L20.0781 19.0312C20.2083 19.1562 20.2943 19.3047 20.3359 19.4766C20.3776 19.6484 20.3776 19.8229 20.3359 20C20.2943 20.1719 20.2057 20.3203 20.0703 20.4453C19.9453 20.5755 19.7943 20.6641 19.6172 20.7109C19.4453 20.7526 19.2734 20.7526 19.1016 20.7109C18.9349 20.6693 18.7891 20.5833 18.6641 20.4531L15 16.7969L11.3438 20.4609C11.2188 20.5807 11.0677 20.6641 10.8906 20.7109C10.7188 20.7526 10.5443 20.7526 10.3672 20.7109C10.1953 20.6641 10.0469 20.5781 9.92188 20.4531Z"
              fill="white"
              fillOpacity="0.8"
            />
          </svg>
        </button>
      </div>

      {/* Scan Frame with Corner Indicators */}
      <div
        className="absolute z-20"
        style={{
          top: '35vh',
          left: 'calc(50% - 125px)',
          width: '250px',
          height: '250px',
        }}
      >
        {/* Top-left corner */}
        <div className="absolute top-0 left-0 h-8 w-8 rounded-tl-lg border-t-4 border-l-4 border-blue-500" />

        {/* Top-right corner */}
        <div className="absolute top-0 right-0 h-8 w-8 rounded-tr-lg border-t-4 border-r-4 border-blue-500" />

        {/* Bottom-left corner */}
        <div className="absolute bottom-0 left-0 h-8 w-8 rounded-bl-lg border-b-4 border-l-4 border-blue-500" />

        {/* Bottom-right corner */}
        <div className="absolute right-0 bottom-0 h-8 w-8 rounded-br-lg border-r-4 border-b-4 border-blue-500" />
      </div>

      {/* Error Message */}
      {error && (
        <div className="absolute top-32 right-4 left-4 z-30">
          <div className="rounded-lg bg-red-500/90 px-4 py-3 text-center text-white shadow-lg">
            {error}
          </div>
        </div>
      )}

      {/* Bottom Section - Flash and Hint Text */}
      <div className="absolute right-0 bottom-24 left-0 z-20 flex flex-col items-center gap-4">
        {/* Flash Toggle Button - Only show if supported */}
        {/* Note: Flash is not supported in html5-qrcode, hiding for now */}
        {/*
        <button
          onClick={toggleFlash}
          className="flex h-12 w-12 items-center justify-center rounded-full transition-all"
          aria-label="Toggle Flash"
        >
          <svg
            fill="white"
            viewBox="0 0 1024 1024"
            className="h-8 w-8 opacity-80"
          >
            <path d="M298.666667 85.333333v469.333334h128v384l298.666666-512h-170.666666l170.666666-341.333334z" />
          </svg>
        </button>
        */}

        {/* Hint Text */}
        <p className="text-center text-base font-medium text-white/80">
          Scan OntaPay QR Code
        </p>
      </div>

      {/* Custom styles to override html5-qrcode defaults */}
      <style>{`
        #${scannerDivId} {
          width: 100vw !important;
          height: 100vh !important;
        }
        #${scannerDivId} > div {
          width: 100% !important;
          height: 100% !important;
        }
        #${scannerDivId} video {
          width: 100% !important;
          height: 100% !important;
          object-fit: cover !important;
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
        }
        /* Hide the default qr-box outline */
        #${scannerDivId}__scan_region {
          border: none !important;
        }
        /* Hide default UI elements */
        #${scannerDivId}__dashboard,
        #${scannerDivId}__dashboard_section,
        #${scannerDivId}__dashboard_section_csr {
          display: none !important;
        }
      `}</style>
    </div>
  )
}
