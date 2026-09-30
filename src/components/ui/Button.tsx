import Link from "next/link";
import type { ReactNode } from "react";
import s from "./hardware.module.css";

type Variant = "hw" | "term" | "ghost";

export function Button({
  children,
  variant = "hw",
  href,
  external,
  ...rest
}: {
  children: ReactNode;
  variant?: Variant;
  href?: string;
  external?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const cls = [s.btn, variant !== "hw" ? s[variant] : "", rest.className].filter(Boolean).join(" ");
  if (href) {
    if (external) {
      return (
        <a href={href} className={cls} target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      );
    }
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button {...rest} className={cls}>
      {children}
    </button>
  );
}
