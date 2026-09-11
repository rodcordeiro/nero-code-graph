namespace Pilot.Api;

using Pilot.Orders;

public class OrdersController
{
    private readonly OrderService _orders;

    public OrdersController(OrderService orders)
    {
        _orders = orders;
    }

    public void create(string orderId)
    {
        _orders.PlaceOrder(orderId);
    }
}
