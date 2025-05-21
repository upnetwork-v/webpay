import { createFileRoute } from "@tanstack/react-router";
import { buildUrl } from "@/utils/phantom";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  function openPhantomConnectDeeplink(dappPublicKey: string) {
    const redirectUrl = `${window.location.href}`;
    const deeplinkUrl = buildUrl(
      "connect",
      new URLSearchParams({
        dapp_encryption_public_key: dappPublicKey,
        cluster: "devnet",
        app_url: redirectUrl,
        redirect_link: redirectUrl,
      })
    );
    console.log(deeplinkUrl);

    window.location.href = deeplinkUrl;
  }

  return (
    <div className="p-2">
      <h3>Welcome Home!</h3>
      <button
        className="btn"
        onClick={() =>
          openPhantomConnectDeeplink(
            "AuETy323Hxq548W84EtmqhhTNjivfU9Ugioh8bas2Uu"
          )
        }
      >
        Connect Phantom
      </button>
    </div>
  );
}
