import type { DisplayTicket } from './types';

export type RootStackParamList = {
  Login: undefined;
  Main: undefined;
  TicketDetail: { ticket: DisplayTicket };
};

export type MainTabParamList = {
  Tickets: undefined;
  Settings: undefined;
};
