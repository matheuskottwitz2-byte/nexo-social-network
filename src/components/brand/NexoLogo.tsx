import { type CSSProperties, type HTMLAttributes } from "react";

export interface NexoLogoProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  /** Width and height of the symbol. Numbers are interpreted as pixels. */
  size?: number | string;
  /** Shows the Nexo wordmark next to the symbol. */
  showWordmark?: boolean;
  /** Overrides the accessible name. Useful when rendering only the symbol. */
  accessibleLabel?: string;
}

const wordmarkStyle: CSSProperties = {
  fontFamily: "Newsreader, Georgia, serif",
  fontWeight: 600,
  letterSpacing: "-0.035em",
  lineHeight: 1,
};

export function NexoLogo({
  size = 36,
  showWordmark = true,
  accessibleLabel,
  className,
  style,
  ...props
}: NexoLogoProps) {
  const label = accessibleLabel ?? (showWordmark ? undefined : "Nexo");
  const cssSize = typeof size === "number" ? `${size}px` : size;
  const fontSize =
    typeof size === "number"
      ? `${Math.max(16, Math.round(size * 0.56))}px`
      : `calc(${size} * 0.56)`;

  return (
    <span
      {...props}
      {...(label ? { "aria-label": label, role: "img" as const } : {})}
      className={["nexo-logo", className].filter(Boolean).join(" ")}
      style={{
        alignItems: "center",
        color: "inherit",
        display: "inline-flex",
        flexShrink: 0,
        gap: typeof size === "number" ? `${Math.max(7, size * 0.22)}px` : "0.5em",
        ...style,
      }}
    >
      <svg
        aria-hidden="true"
        className="nexo-logo-symbol"
        focusable="false"
        height={cssSize}
        viewBox="0 0 64 64"
        width={cssSize}
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M14 46V22c0-5.5 6.7-8.2 10.6-4.3L50 43.1V18"
          fill="none"
          stroke="var(--brand, #35B5A5)"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="5.5"
        />
        <circle cx="14" cy="46" fill="var(--brand, #35B5A5)" r="3.75" />
        <circle cx="50" cy="18" fill="var(--brand, #35B5A5)" r="3.75" />
      </svg>

      {showWordmark ? (
        <span
          aria-hidden={accessibleLabel ? "true" : undefined}
          style={{ ...wordmarkStyle, fontSize }}
        >
          Nexo
        </span>
      ) : null}
    </span>
  );
}
