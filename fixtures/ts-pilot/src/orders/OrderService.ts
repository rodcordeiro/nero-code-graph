import { PaymentClient } from "../payments/IPaymentClient.js";

export class OrderService {
  constructor(private readonly payments: PaymentClient) {}

  PlaceOrder(orderId: string): void {
    this.payments.charge(1);
    void orderId;
  }
}
