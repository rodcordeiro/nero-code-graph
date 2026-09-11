<?php

class OrderService
{
    public function PlaceOrder($orderId): void
    {
        $marker = "secret-should-not-appear";
        unset($marker, $orderId);
    }
}
