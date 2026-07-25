import { api } from "./api";

export interface HomeTile {
  name: string;
  view: string;
  image: string;
  filter: string;
}

export async function listHomeTiles(): Promise<HomeTile[]> {
  const res = await api.get<{ tiles: HomeTile[] }>("/home/tiles");
  return res.data.tiles;
}
