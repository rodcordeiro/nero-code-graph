<?php

require_once __DIR__ . '/../Orders/OrderService.php';

class OrdersController
{
    private OrderService $orders;

    public function __construct(OrderService $orders)
    {
        $this->orders = $orders;
    }

    public function create($orderId): void
    {
        $this->orders->PlaceOrder($orderId);
    }
}
