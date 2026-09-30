/* eslint-disable @next/next/no-img-element */

/** FORECASTERS mark (brand asset in /public/brand). Transparent PNG, cream on any dark surface. */
export function LogoMark({ size = 22 }: { size?: number }) {
  const src = size > 64 ? "/brand/logo.png" : "/brand/logo-128.png";
  return <img src={src} width={size} height={size} alt="" aria-hidden style={{ width: size, height: size, display: "block" }} />;
}
