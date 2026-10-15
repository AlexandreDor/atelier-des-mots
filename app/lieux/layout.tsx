import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Générateur de noms de lieux · Atelier des mots",
  description: "Générez des noms de lieux français ou des noms russes romanisés à partir de corpus géographiques documentés.",
};

export default function PlacesLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
