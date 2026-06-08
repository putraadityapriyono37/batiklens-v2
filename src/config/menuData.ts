import { MenuItem } from "@/types/menu";

// @ts-ignore
export const headerData: any[] = [
  {
    id: 1,
    title: "Home",
    path: "/",
  },
  {
    id: 2,
    title: "Fitur",
    // Tidak perlu 'path' karena ini adalah menu dropdown
    submenu: [
      {
        id: 21,
        title: "Kenal Batik",
        path: "/KenalBatik",
      },
      {
        id: 22,
        title: "Batik Fit In",
        path: "/BatikFit",
      },
      {
        id: 23,
        title: "Studio Kreasi",
        path: "/StudioKreasi",
      },
      {
        id: 24,
        title: "Batik Pedia",
        path: "/BatikPedia",
      },
    ],
  },
  {
    id: 3,
    title: "Eksplore",
    path: "/#eksplore",
  },
  {
    id: 4,
    title: "Galeri",
    path: "/#galeri",
  },
];
