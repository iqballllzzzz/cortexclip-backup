import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile: any;
    onloadTurnstileCallback: () => void;
  }
}

export function CloudflareTurnstile({ onVerify }: { onVerify: (token: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sitekey = import.meta.env.VITE_TURNSTILE_SITE_KEY || "1x00000000000000000000AA";
    
    const renderWidget = () => {
      if (window.turnstile && containerRef.current) {
        window.turnstile.render(containerRef.current, {
          sitekey,
          theme: "dark",
          callback: (token: string) => {
            onVerify(token);
          },
        });
      }
    };

    if (!window.turnstile) {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
      
      script.onload = () => {
        renderWidget();
      };
    } else {
      renderWidget();
    }
  }, [onVerify]);

  return <div ref={containerRef} className="my-4 flex justify-center" />;
}
