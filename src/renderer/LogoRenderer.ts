export class LogoRenderer {
  private imgEl: HTMLImageElement | null = null;

  public render(container: HTMLElement, src: string): void {
    this.dispose();

    const img = document.createElement("img");
    img.className = "logo-img";
    img.src = import.meta.env.BASE_URL + src.replace(/^\//, "");
    img.alt = "";

    container.appendChild(img);
    this.imgEl = img;
  }

  public dispose(): void {
    if (this.imgEl) {
      this.imgEl.removeAttribute("src");
      this.imgEl.remove();
      this.imgEl = null;
    }
  }
}
