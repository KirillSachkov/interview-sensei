/** The size of a file for the Candidate: «850 Б», «12 КБ», «3,4 МБ». */
export function sizeText(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} Б`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} КБ`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} МБ`;
}
