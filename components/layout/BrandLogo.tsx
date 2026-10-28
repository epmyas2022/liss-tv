import Link from "next/link";

interface BrandLogoProps {
  className?: string;
  asLink?: boolean;
}

export function BrandLogo({ className = "", asLink = true }: BrandLogoProps) {
  const logoContent = (
    <span
      className={`font-poppins text-white text-2xl sm:text-3xl lg:text-[32px] font-black tracking-tight shrink-0 select-none inline-flex items-center gap-0.5 ${className}`}
    >
      <span>LISS</span>
      <span className="text-[#e50914] drop-shadow-[0_0_16px_rgba(229,9,20,0.6)]">
        TV
      </span>
    </span>
  );

  if (!asLink) {
    return logoContent;
  }

  return (
    <Link
      href="/"
      className="inline-flex items-center shrink-0 focus:outline-none transition-transform active:scale-95"
      aria-label="Liss TV Inicio"
    >
      {logoContent}
    </Link>
  );
}

export default BrandLogo;
