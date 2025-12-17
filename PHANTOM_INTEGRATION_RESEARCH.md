# Phantom Wallet Integration Research

## 1. Testing DApp in Phantom Mobile Wallet
To test your local DApp development server within the Phantom Mobile App:

1.  **Network Setup**: Ensure your computer (running the dev server) and your mobile device are on the **same Wi-Fi network**.
2.  **Start Dev Server**: Run your project with `host` enabled (e.g., `yarn dev` or `vite --host`). Note the LAN IP address displayed (e.g., `http://192.168.1.5:5173`).
3.  **Access via Phantom**:
    *   Open the Phantom Wallet app on your mobile device.
    *   Tap the **Browser Icon (Globe/Explore)** at the bottom right.
    *   Enter your LAN IP address in the search bar.
4.  **Interaction**: The DApp should load. Clicking "Connect" should trigger the wallet connection prompt directly within the browser.

## 2. Submitting to Phantom Portal (App Listing)
To have your DApp listed in Phantom's "Explore" section or recognized with rich metadata:

**Portal URL**: [https://phantom.app/developers](https://phantom.app/developers)

### Submission Steps:
1.  **Create Account & App**: Log in to the portal and create a new App entry.
2.  **Verify Domain**: Prove ownership of your domain (requires **HTTPS**).
3.  **Metadata**: Provide App Icon, Name, Description, and Category (DeFi, Payment, etc.).
4.  **Submit for Review**: Phantom checks for:
    *   **Security**: Does the app simulate transactions safely? (Blowfish verification)
    *   **Technical Compliance**: Support for connection standards.

### Requirements:
*   **HTTPS**: Mandatory for domain verification.
*   **Deep Links/Universal Links**: Must be supported (see Reference Implementation below).
*   **Security**: No handling of user private keys; transparent transaction requests.

## 3. Integration Best Practices (Hybrid Approach)
Phantom recommends a hybrid approach to handle both **In-App Browser** (internal) and **External Browser** (Safari/Chrome) scenarios efficiently.

### A. The "Injected Provider" (Preferred for In-App)
When a user opens your DApp inside Phantom's built-in browser, Phantom injects a `window.solana` object.
*   **Mechanism**: Direct JavaScript communication.
*   **Pros**: No page redirects, no refreshing, seamless "Connect" and "Sign" experience.
*   **Implementation**:
    ```typescript
    // Check for provider
    const provider = window.solana;
    if (provider && provider.isPhantom) {
        await provider.connect(); // Returns Promise<PublicKey>
    }
    ```

### B. Deep Links / Universal Links (Fallback for External)
When a user opens your DApp in Safari or Chrome on mobile.
*   **Mechanism**: URL Redirection (`https://phantom.app/ul/v1/...`).
*   **Pros**: The only way to wake up the Phantom App from an external browser.
*   **Cons**: Requires leaving the current page, opening the App, and then redirecting back (causing a page refresh/reload).
*   **Implementation**:
    generate a URL like `https://phantom.app/ul/v1/connect?app_url=...&redirect_link=...` and set `window.location.href`.

### C. Recommendation for `PhantomWalletAdapter.ts`
Current implementation handles Deep Links well but treats all mobile devices as "Deep Link" targets.
**Optimization**:
1.  **Prioritize `window.solana`**: Always check `window.solana?.isPhantom` first. If present, use it (even on mobile).
2.  **Fallback**: Only if `window.solana` is missing, use the Deep Link logic.


## 4. Key Official References

*   **Developer Portal (App Submission)**:
    [https://phantom.app/developers](https://phantom.app/developers)
    *Use this portal to manage your app listing, verify domains, and submit for review.*

*   **Detecting the Provider (In-App Browser)**:
    [https://docs.phantom.app/solana/detecting-the-provider](https://docs.phantom.app/solana/detecting-the-provider)
    *Official guide on how to check for `window.solana`.*

*   **Deep Links Guide (External Browser)**:
    [https://docs.phantom.app/phantom-deeplinks](https://docs.phantom.app/phantom-deeplinks)
    *Specification for Universal Links connecting to Phantom from external apps/browsers.*

*   **Best Practices**:
    [https://docs.phantom.app/resources/best-practices](https://docs.phantom.app/resources/best-practices)
