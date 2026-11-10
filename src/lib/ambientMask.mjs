// An alpha-mask hole removes every lighting layer over the player's bounds.
export function ambientScreenMask(rect, width, height) {
 if(!rect||!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return '';
 const clamp=(value,max)=>Math.max(0,Math.min(max,Number.isFinite(value)?value:0));
 const left=clamp(rect.left,width),top=clamp(rect.top,height),right=clamp(rect.right,width),bottom=clamp(rect.bottom,height);
 const outer=`M0 0H${width}V${height}H0Z`;
 const hole=right>left&&bottom>top?`M${left} ${top}H${right}V${bottom}H${left}Z`:'';
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><path fill="white" fill-rule="evenodd" d="${outer}${hole}"/></svg>`;
 return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
