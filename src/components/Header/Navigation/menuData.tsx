import { MenuItem } from "@/types/menu";

// @ts-ignore
export const headerData: any[] = [
  {
    label: "Home",
    href: "/",
  },
  {
    label: "Fitur",
    // Tidak ada 'href' di sini, karena ini adalah wadah dropdown
    submenu: [
      {
        label: "Kenal Batik",
        href: "/KenalBatik",
      },
      {
        label: "Batik Fit In",
        href: "/BatikFit",
      },
      {
        label: "Studio Kreasi",
        href: "/StudioKreasi",
      },
      {
        label: "Batik Pedia",
        href: "/BatikPedia",
      },
    ],
  },
  {
    label: "Galeri",
    href: "/#galeri",
  },
];
