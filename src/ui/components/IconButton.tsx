import type { CSSProperties, ReactNode } from "react";

const iconButtonBaseStyle: CSSProperties = {
  width: 36,
  height: 36,
  padding: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  borderRadius: 10,
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "var(--dp-icon-border)",
  background: "var(--dp-icon-bg)",
  cursor: "pointer",
  color: "inherit",
  transition:
    "background-color 120ms ease, border-color 120ms ease, transform 120ms ease",
};

const iconButtonActiveStyle: CSSProperties = {
  borderColor: "var(--dp-active)",
  color: "var(--dp-active)",
  background: "rgba(124, 77, 255, 0.14)",
  boxShadow: "0 0 0 1px rgba(124, 77, 255, 0.3)",
};

const iconSpanStyle: CSSProperties = {
  width: 18,
  height: 18,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  color: "inherit",
};

export type IconButtonProps = {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  active?: boolean;
  testId?: string;
  disabled?: boolean;
};

export function IconButton({
  label,
  icon,
  onClick,
  active,
  testId,
  disabled,
}: IconButtonProps) {
  const btnStyle = {
    ...iconButtonBaseStyle,
    ...(active ? iconButtonActiveStyle : {}),
    ...(disabled
      ? { opacity: 0.5, cursor: "not-allowed", borderColor: "#ccc" }
      : {}),
  };
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      data-testid={testId}
      disabled={disabled}
      style={btnStyle}
    >
      <span style={iconSpanStyle} aria-hidden>
        {icon}
      </span>
    </button>
  );
}
