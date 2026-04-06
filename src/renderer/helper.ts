export function releaseVideoElement(video: HTMLVideoElement): void {
  video.pause();
  video.removeAttribute("src");
  video.srcObject = null;
  video.load();
}
