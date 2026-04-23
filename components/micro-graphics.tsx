type MicroGridProps = {
  className?: string;
};

type CornerMarksProps = {
  color?: string;
  size?: number;
  opacity?: number;
};

type CrosshairProps = MicroGridProps & {
  color?: string;
  size?: number;
  opacity?: number;
};

type AnnotationLineProps = MicroGridProps & {
  label: string;
  value: string;
};

export function MicroGrid({ className = "" }: MicroGridProps) {
  return (
    <svg className={`micro-grid ${className}`} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
      <defs>
        <pattern id="microgrid-sm" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,107,43,0.055)" strokeWidth="0.5" />
        </pattern>
        <pattern id="microgrid-lg" width="200" height="200" patternUnits="userSpaceOnUse">
          <rect width="200" height="200" fill="url(#microgrid-sm)" />
          <path d="M 200 0 L 0 0 0 200" fill="none" stroke="rgba(255,107,43,0.13)" strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#microgrid-lg)" />
    </svg>
  );
}

export function CornerMarks({ color = "#ff6b2b", size = 16, opacity = 0.5 }: CornerMarksProps) {
  return (
    <>
      <svg className="corner-mark corner-mark--tl" width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" style={{ opacity }}>
        <path d={`M ${size} 0 L 0 0 L 0 ${size}`} stroke={color} strokeWidth="1" />
      </svg>
      <svg className="corner-mark corner-mark--tr" width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" style={{ opacity }}>
        <path d={`M 0 0 L ${size} 0 L ${size} ${size}`} stroke={color} strokeWidth="1" />
      </svg>
      <svg className="corner-mark corner-mark--bl" width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" style={{ opacity }}>
        <path d={`M 0 0 L 0 ${size} L ${size} ${size}`} stroke={color} strokeWidth="1" />
      </svg>
      <svg className="corner-mark corner-mark--br" width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" style={{ opacity }}>
        <path d={`M ${size} ${size} L ${size} 0`} stroke={color} strokeWidth="1" />
        <path d={`M ${size} ${size} L 0 ${size}`} stroke={color} strokeWidth="1" />
      </svg>
    </>
  );
}

export function Crosshair({ className = "", size = 24, color = "#ff6b2b", opacity = 0.4 }: CrosshairProps) {
  return (
    <svg className={`crosshair ${className}`} width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" style={{ opacity }}>
      <line x1={size / 2} y1="0" x2={size / 2} y2={size} stroke={color} strokeWidth="0.75" />
      <line x1="0" y1={size / 2} x2={size} y2={size / 2} stroke={color} strokeWidth="0.75" />
      <circle cx={size / 2} cy={size / 2} r={size / 6} stroke={color} strokeWidth="0.75" fill="none" />
    </svg>
  );
}

export function AnnotationLine({ label, value, className = "" }: AnnotationLineProps) {
  return (
    <div className={`annotation-line ${className}`}>
      <span className="annotation-line__lead" />
      <span className="annotation-line__label">{label}</span>
      <span className="annotation-line__rule" />
      <span className="annotation-line__value">{value}</span>
    </div>
  );
}
