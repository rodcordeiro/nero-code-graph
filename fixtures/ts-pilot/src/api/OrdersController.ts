import { OrderService } from "../orders/OrderService.js";

export class OrdersController {
  constructor(private readonly orders: OrderService) {}

  create(orderId: string): void {
    this.orders.PlaceOrder(orderId);
  }
}
