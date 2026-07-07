import fetch from "node-fetch";

async function run() {
  try {
    const res = await fetch("http://localhost:3000/api/user/returns", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cookie": "connect.sid=fake-session" // Won't work without auth, but we can see what error we get.
      },
      body: JSON.stringify({
        orderId: "123",
        customerName: "Test",
        customerPhone: "12345678",
        reason: "Test",
        items: "Test Item (1)"
      })
    });
    console.log(res.status, await res.text());
  } catch(e) {
    console.error(e);
  }
}
run();
