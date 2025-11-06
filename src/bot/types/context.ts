import { Scenes } from 'telegraf';

export interface OrderData {
  type?: number;
  stop_desk?: number;
  nom_client?: string;
  telephone?: string;
  code_wilaya?: number;
  commune?: string;
  adresse?: string;
  montant?: string;
  produit?: string;
  quantite?: string;
}

export interface MySceneSession extends Scenes.SceneSessionData {
  fromWebApp?: boolean;
  order?: OrderData;
}

export interface MySession extends Scenes.SceneSession<MySceneSession> {
  order: OrderData;
  step: string | null;
}

export type MyContext = Omit<Scenes.SceneContext<MySceneSession>, 'session' | 'scene'> & {
  session: MySession;
  scene: Scenes.SceneContextScene<MyContext, MySceneSession>;
};
