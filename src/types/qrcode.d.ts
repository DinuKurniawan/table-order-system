declare module "qrcode" {
  export interface QRCodeOptions {
    errorCorrectionLevel?: "L" | "M" | "Q" | "H";
    margin?: number;
    width?: number;
  }

  export function toBuffer(text: string, options?: QRCodeOptions): Promise<Buffer>;

  export function toString(
    text: string,
    options?: QRCodeOptions & { type: "svg" }
  ): Promise<string>;
}
