namespace Pilot.Orders;

public class OrderService
{
    public void PlaceOrder(string orderId)
    {
        var marker = "secret-should-not-appear";
        _ = marker;
        InternalHelper();
        _ = orderId;
    }

    // Implicit private (no access modifier) — must still become a method node.
    void InternalHelper()
    {
    }
}
