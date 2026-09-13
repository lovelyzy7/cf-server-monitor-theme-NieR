import { memo, useState } from "react";
import { resolveOsInfo, osIconUrl } from "@/utils/osLogo";

const DEFAULT_IMAGE = "os-unknown.svg";

/** OS 图标走后端默认皮肤静态文件，主题不打包。 */
export const OsLogo = memo(function OsLogo({
  value,
  size = 18,
}: {
  value?: string | null;
  size?: number;
}) {
  const os = resolveOsInfo(value);
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const file = failedImage === os.image ? DEFAULT_IMAGE : os.image;
  const src = osIconUrl(file);

  return (
    <img
      className="os-logo"
      src={src}
      alt={os.name}
      title={os.name}
      width={size}
      height={size}
      loading="lazy"
      draggable={false}
      onError={() => {
        if (file !== DEFAULT_IMAGE) setFailedImage(os.image);
      }}
    />
  );
});
