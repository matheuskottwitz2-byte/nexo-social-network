import { useId, type CSSProperties, type HTMLAttributes } from "react";

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
  fontFamily: 'Manrope, "DM Sans", ui-sans-serif, system-ui, sans-serif',
  fontWeight: 750,
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
  const instanceId = useId().replace(/:/g, "");
  const gradientId = `nexo-logo-gradient-${instanceId}`;
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
        focusable="false"
        height={cssSize}
        viewBox="0 0 64 64"
        width={cssSize}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient
            id={gradientId}
            x1="0"
            x2="64"
            y1="0"
            y2="64"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#7C3AED" />
            <stop offset="1" stopColor="#4C1D95" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="18" fill={`url(#${gradientId})`} />
        <path
          d="M18.5 43.5v-23l27 23v-23"
          fill="none"
          stroke="#FFFDFB"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="6"
        />
        <circle cx="18.5" cy="20.5" r="4.25" fill="#FB7185" />
        <circle cx="45.5" cy="43.5" r="4.25" fill="#FB7185" />
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
