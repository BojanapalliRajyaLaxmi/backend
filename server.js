const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const axios=require("axios")
const stripe = require("stripe")
const app = express();
const port = 3002;
const seckey="wertyuiopzxcvbnm,3456";
app.use(cors());
app.use(express.json());
const mongo_url = "mongodb+srv://rajyalaxmiraj123:raji1234@practice.16udh.mongodb.net/practice";
mongoose.connect(mongo_url)
    .then(() => console.log("MongoDB connected!"))
    .catch(err => console.error("MongoDB connection error:", err));
const JWT_SECRET = seckey;
const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    tokens: [{ token: String }],
    wishlist: [
        {
            name: String,
            price: Number,
            image: String,
            description: String,
            rating: Number,
            ingredients: [String]
        }
    ],
    cart: [
        {
            name: String,
            price: Number,
            image: String,
            description: String,
            rating: Number,
            ingredients: [String]
        }
    ],
    restaurant: [
        {
            name: String,
            cuisine: String,
            location: String
        }
    ]
    
});
const User = mongoose.model("User", userSchema);
app.post("/register", async (req, res) => {
    const { name, email, password } = req.body;
    try {
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.send({ message: "User already exists!" });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ name, email, password: hashedPassword });
        await newUser.save();
        res.send({ message: "User registered successfully!", user: newUser });
    } catch (error) {
        res.send({ message: "Server error", error });
    }
});
app.post("/login", async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ message: "Invalid email or password!" });
        }
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: "Invalid email or password!" });
        }
        const token = jwt.sign({ userId: user._id, email: user.email }, seckey, { expiresIn: "72h" });
        if (!user.tokens) user.tokens = [];
        user.tokens.push({ token });
        await user.save();
        
        // ✅ Send user details in the response
        res.status(200).json({ 
            message: "Login successful!", 
            token, 
            user: { name: user.name, email: user.email } 
        });
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ message: "Server error", error });
    }
});

const API_KEY = "5b3ce3597851110001cf6248c939f3ae97e04f9da7e3f6f5dd40f66c";
app.get("/route", async (req, res) => {
    try {
        const { start, end } = req.query;
        if (!start || !end) {
            return res.status(400).json({ error: "Missing start or end coordinates" });
        }
        const url = `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${API_KEY}&start=${start}&end=${end}`;
        const response = await axios.get(url);
        res.json(response.data);
    } catch (error) {
        console.error("Error fetching route:", error.response?.data || error.message);
        res.status(500).json({ error: "Failed to fetch route" });
    }
});
const authenticateUser = (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ message: "Unauthorized" });

    try {
        const decoded = jwt.verify(token, seckey);
        req.user = decoded;
        next();
    } catch (error) {
        res.status(401).json({ message: "Invalid token" });
    }
};
app.get("/wishlist", authenticateUser, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId);
        if (!user) return res.status(404).json({ message: "User not found" });
        res.json({ wishlist: user.wishlist || [] });
    } catch (error) {
        console.error("Error fetching wishlist:", error);
        res.status(500).json({ message: "Server error" });
    }
});
app.post("/wishlist", authenticateUser, async (req, res) => {
    const { dish } = req.body;
    try {
        const user = await User.findById(req.user.userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        const index = user.wishlist.findIndex((item) => item.name === dish.name);
        if (index !== -1) {
            user.wishlist.splice(index, 1);
        } else {
            user.wishlist.push(dish);
        }
        await user.save();
        res.json({ wishlist: user.wishlist });
    } catch (error) {
        res.status(500).json({ message: "Server error", error });
    }
});
app.delete("/wishlist/:dishId", authenticateUser, async (req, res) => {
    try {
        const { dishId } = req.params;
        console.log("Received delete request for:", dishId);

        if (!dishId) {
            return res.status(400).json({ success: false, message: "Invalid dish ID" });
        }

        const user = await User.findById(req.user.userId);
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        // Remove the dish from the wishlist based on ID
        user.wishlist = user.wishlist.filter((item) => item._id.toString() !== dishId);
        await user.save();

        res.json({ success: true, wishlist: user.wishlist });
    } catch (error) {
        console.error("Error deleting wishlist item:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

app.get("/cart", authenticateUser, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId);
        if (!user) return res.status(404).json({ message: "User not found" });
        res.json({ cart: user.cart || [] });
    } catch (error) {
        console.error("Error fetching cart:", error);
        res.status(500).json({ message: "Server error" });
    }
});
app.post("/cart", authenticateUser, async (req, res) => {
    const { dish } = req.body;
    console.log("Received dish:", dish);
    try {
        const user = await User.findById(req.user.userId);
        if (!user) {
            console.error("User not found");
            return res.status(404).json({ message: "User not found" });
        }
        const index = user.cart.findIndex((item) => item.name === dish.name);
        if (index !== -1) {
            user.cart.splice(index, 1);
        } else {
            user.cart.push(dish);
        }
        await user.save();
        res.json({ cart: user.cart });
    } catch (error) {
        res.status(500).json({ message: "Server error", error });
    }
});
app.delete("/cart", authenticateUser, async (req, res) => {
    try {
        const { dish } = req.body;
        console.log("Received delete request for:", dish);
        if (!dish || !dish.name) {
            return res.status(400).json({ success: false, message: "Invalid dish data" });
        }
        const user = await User.findById(req.user.userId);
        if (!user) return res.status(404).json({ success: false, message: "User not found" });
        user.cart = user.cart.filter((item) => item.name !== dish.name);
        await user.save();
        res.json({ success: true, cart: user.cart });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error" });
    }
});
// Get Liked Restaurants
app.get("/restaurant", authenticateUser, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId);
        if (!user) return res.status(404).json({ message: "User not found" });

        res.json({ restaurants: user.restaurant || [] }); // Ensure an array is returned
    } catch (error) {
        console.error("❌ Error fetching restaurants:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
});

app.post("/restaurant", authenticateUser, async (req, res) => {
    const { restaurant } = req.body;
    if (!restaurant || !restaurant.name) {
        return res.status(400).json({ message: "Invalid restaurant data" });
    }

    try {
        const user = await User.findById(req.user.userId);
        if (!user) return res.status(404).json({ message: "User not found" });

        if (!Array.isArray(user.restaurant)) {
            user.restaurant = [];
        }

        const index = user.restaurant.findIndex((item) => item.name === restaurant.name);

        if (index !== -1) {
            user.restaurant.splice(index, 1); // Remove from liked list
        } else {
            user.restaurant.push(restaurant); // Add to liked list
        }

        await user.save();
        res.json({ success: true, restaurants: user.restaurant });
    } catch (error) {
        console.error("Error updating restaurant:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
});


// Delete a Restaurant from the Liked List
app.delete("/restaurant", authenticateUser, async (req, res) => {
    try {
        const { restaurant } = req.body;
        if (!restaurant || !restaurant.name) {
            return res.status(400).json({ success: false, message: "Invalid restaurant data" });
        }

        const user = await User.findById(req.user.userId);
        if (!user) return res.status(404).json({ success: false, message: "User not found" });

        user.restaurant = user.restaurant.filter((item) => item.name !== restaurant.name);
        await user.save();

        res.json({ success: true, restaurants: user.restaurant });
    } catch (error) {
        console.error("❌ Error deleting restaurant:", error);
        res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
});
app.post("/create-checkout-session", authenticateUser, async (req, res) => {
    try {
        const { cartItems } = req.body; // Get items from request

        if (!cartItems || cartItems.length === 0) {
            return res.status(400).json({ message: "Cart is empty" });
        }

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            line_items: cartItems.map((item) => ({
                price_data: {
                    currency: "usd",
                    product_data: { name: item.name },
                    unit_amount: item.price * 100, // Convert dollars to cents
                },
                quantity: 1,
            })),
            mode: "payment",
            success_url: "http://localhost:3000/success",
            cancel_url: "http://localhost:3000/cancel",
            customer_email: req.user.email, // Use authenticated user's email
        });

        res.json({ id: session.id });
    } catch (error) {
        console.error("Stripe Error:", error);
        res.status(500).json({ message: "Payment processing failed", error: error.message });
    }
});


app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});


