import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Analyse des mots · Atelier des mots",
  description: "Comparez les scores de mots et les ressemblances entre dictionnaires.",
};

export default function AnalysisLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
