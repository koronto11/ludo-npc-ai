export const widthLimits = {group:{min:280,max:1200},event:{min:180,max:1200}};

export function resizedControlWidth(kind, width, delta) {
  const {min,max} = widthLimits[kind];
  return Math.max(min,Math.min(max,Math.round(width + delta)));
}
