export interface DeviceState {
  sessionCode: string;
  barcode: string;
  ram: number;
  strikes: number;
  lastStatus?: string;
  updatedAt: string;
}
