import type { Metadata } from "next";
import { UxUiDemoGallery } from "./ux-ui-demo-gallery";

export const metadata: Metadata = {
  title: "Galeria UX/UI | DRIVXIS",
  description: "Galeria demostrativa de patrones UX/UI aplicados al sistema visual DRIVXIS.",
};

export default function UxUiDemoPage() {
  return <UxUiDemoGallery />;
}
