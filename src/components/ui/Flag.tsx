import { useState } from "react";
import { hostAssetUrl } from "@/services/cfsm/config";
import { getDisplayRegionCode } from "@/utils/geo";

interface FlagProps {
  region?: string | null;
  size?: number;
}

export function Flag({ region, size = 14 }: FlagProps) {
  const value = region?.trim() ?? "";
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (!value) {
    return (
      <span
        aria-hidden
        className="flag"
        style={{
          width: size + 8,
          height: size,
          background: "var(--bg-cream-dark)",
          border: "1px solid var(--accent)",
          flexShrink: 0,
        }}
      />
    );
  }

  const flagCode = getDisplayRegionCode(value);
  const src = hostAssetUrl(`/flags/${flagCode.toLowerCase()}.svg`);
  const alt = `地区旗帜: ${flagCode}`;

  if (failedSrc === src) {
    return (
      <span
        role="img"
        aria-label={alt}
        className="flag"
        title={alt}
        style={{
          width: size + 8,
          height: size,
          background: "var(--bg-cream-dark)",
          border: "1px solid var(--accent)",
          flexShrink: 0,
        }}
      />
    );
  }

  return (
    <span
      className="flag"
      style={{ width: size + 8, height: size, lineHeight: 0, flexShrink: 0 }}
    >
      <img
        src={src}
        alt={alt}
        loading="lazy"
        style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
        onError={() => setFailedSrc(src)}
      />
    </span>
  );
}
