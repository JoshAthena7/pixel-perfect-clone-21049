import { SVGProps } from "react";

type IrisIconProps = Omit<SVGProps<SVGSVGElement>, "width" | "height"> & {
  size?: number | string;
  className?: string;
};

export function IrisIcon({ size = 16, className, ...rest }: IrisIconProps) {
  return (
    <svg
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      {...rest}
    >
      <ellipse cx="18" cy="18" rx="14" ry="9" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="18" cy="18" r="5" fill="currentColor" fillOpacity="0.2" />
      <circle cx="18" cy="18" r="5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="18" cy="18" r="2" fill="currentColor" />
    </svg>
  );
}

export default IrisIcon;
