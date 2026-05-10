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
    <svg xmlns="http://www.w3.org/2000/svg" className={`micro-grid ${className}`} preserveAspectRatio="xMidYMid slice"><defs><pattern id="microgrid-sm" width="40" height="40" patternUnits="userSpaceOnUse"><path fill="none" stroke="rgba(255,107,43,0.055)" strokeWidth=".5" d="M40 0H0v40"/></pattern><pattern id="microgrid-lg" width="200" height="200" patternUnits="userSpaceOnUse"><path fill="url(#microgrid-sm)" d="M0 0h200v200H0z"/><path fill="none" stroke="rgba(255,107,43,0.13)" strokeWidth=".5" d="M200 0H0v200"/></pattern></defs><rect width="100%" height="100%" fill="url(#microgrid-lg)"/></svg>
  );
}

export function CornerMarks({ color = "#ff6b2b", size = 16, opacity = 0.5 }: CornerMarksProps) {
  return (
    <>
      <svg fill="none" className="corner-mark corner-mark--tl" height={size} style={{ opacity }} viewBox={`0 0 ${size} ${size}`} width={size}/>
      <svg fill="none" className="corner-mark corner-mark--tr" height={size} style={{ opacity }} viewBox={`0 0 ${size} ${size}`} width={size}/>
      <svg fill="none" className="corner-mark corner-mark--bl" height={size} style={{ opacity }} viewBox={`0 0 ${size} ${size}`} width={size}/>
      <svg fill="none" className="corner-mark corner-mark--br" height={size} style={{ opacity }} viewBox={`0 0 ${size} ${size}`} width={size}/>
    </>
  );
}

export function Crosshair({ className = "", size = 24, color = "#ff6b2b", opacity = 0.4 }: CrosshairProps) {
  return (
    <svg fill="none" className={`crosshair ${className}`} height={size} style={{ opacity }} viewBox={`0 0 ${size} ${size}`} width={size}><circle fill="none" cx={size / 2} cy={size / 2} r={size / 6} stroke={color}/></svg>
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
