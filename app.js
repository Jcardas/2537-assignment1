require('dotenv').config();
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const bcrypt = require('bcrypt');
const saltRounds = 12;

const port = process.env.PORT || 8001;

const app = express();

const Joi = require("joi");

app.use(express.urlencoded({ extended: true })); // Middleware to parse form data

app.use(express.static('public'));

app.use(session({
    secret: process.env.NODE_SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: `mongodb+srv://${process.env.MONGODB_USER}:${process.env.MONGODB_PASSWORD}@${process.env.MONGODB_HOST}/${process.env.MONGODB_DATABASE}?retryWrites=true`,
        crypto: {
            secret: process.env.MONGODB_SESSION_SECRET
        }
    })
}));

// Name Variable
let name = '';
// Middleware to set the name variable
app.use((req, res, next) => {
    if (req.session.user) {
        name = req.session.user.name;
    } else {
        name = '';
    }
    next();
});

// Home page
app.get('/', (req, res) => {
    if (req.session.user) {
        const greeting = `Hello, ${req.session.user.name}!`;
        res.send(`
            <h1>${greeting}</h1>
            <button onclick="location.href='/members'">Go to Members Area</button>
            <button onclick="location.href='/logout'">Logout</button>
        `);
    } else {
        res.send(`
            <h1>Welcome</h1>
            <button onclick="location.href='/signup'">Sign Up</button>
            <button onclick="location.href='/login'">Log In</button>
        `);
    }
});

// Sign up page
app.get('/signup', (req, res) => {
    res.send(`
        <h1>Sign Up Page</h1>
        <form action="/signup" method="POST">
            <label for="name">Name:</label>
            <input type="text" id="name" name="name" required><br>

            <label for="email">Email:</label>
            <input type="email" id="email" name="email" required><br>

            <label for="password">Password:</label>
            <input type="password" id="password" name="password" required><br>

            <button type="submit">Sign Up</button>
        </form>
    `);
});

app.post('/signup', async (req, res) => {
    const { name, email, password } = req.body;
    // Joi schema for validation
    const schema = Joi.object({
        name: Joi.string().trim().min(1).max(100).required().messages({
            'string.empty': 'Name is required',
            'any.required': 'Name is required'
        }),
        email: Joi.string().trim().email().required().messages({
            'string.email': 'Email must be valid',
            'string.empty': 'Email is required',
            'any.required': 'Email is required'
        }),
        password: Joi.string().min(6).max(100).required().messages({
            'string.empty': 'Password is required',
            'any.required': 'Password is required',
            'string.min': 'Password must be at least 6 characters'
        })
    });
    const { error } = schema.validate({ name, email, password }, { abortEarly: false });
    if (error) {
        const errorMessages = error.details.map(d => `<li>${d.message}</li>`).join('');
        return res.status(400).send(`<h1>Signup Error</h1><ul>${errorMessages}</ul><a href='/signup'>Back to Sign Up</a>`);
    }

    // Connect to MongoDB
    const { database } = require('./databaseConnection');
    try {
        await database.connect();
        const db = database.db(process.env.MONGODB_DATABASE);
        // Check if user already exists
        const existingUser = await db.collection('users').findOne({ email });
        if (existingUser) {
            return res.status(400).send('<h1>Error: Email already registered!</h1>');
        }
        // Hash the password
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        // Insert user
        await db.collection('users').insertOne({
            name,
            email,
            password: hashedPassword
        });
        // Create session
        req.session.user = { name, email };
        res.redirect('/members');
    } catch (err) {
        console.error(err);
        res.status(500).send('<h1>Internal Server Error</h1>');
    }
});

// Login page
app.get('/login', (req, res) => {
    res.send(`
        <h1>Log In Page</h1>
        <form action="/login" method="POST">
            <label for="email">Email:</label>
            <input type="email" id="email" name="email" required><br>

            <label for="password">Password:</label>
            <input type="password" id="password" name="password" required><br>

            <button type="submit">Log In</button>
        </form>
    `);
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    // Joi schema for validation
    const schema = Joi.object({
        email: Joi.string().email().required(),
        password: Joi.string().min(6).max(100).required()
    });
    const validation = schema.validate({ email, password });
    if (validation.error) {
        return res.status(400).send('<h1>Error: Invalid input!</h1>');
    }
    // Connect to MongoDB
    const { database } = require('./databaseConnection');
    try {
        await database.connect();
        const db = database.db(process.env.MONGODB_DATABASE);
        // Find user
        const user = await db.collection('users').findOne({ email });
        if (!user) {
            return res.status(400).send('<h1>Error: User not found!</h1>');
        }
        // Check password
        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            return res.status(400).send('<h1>Error: Incorrect password!</h1>');
        }
        // Create session
        req.session.user = { name: user.name, email };
        res.redirect('/members');
    } catch (err) {
        console.error(err);
        res.status(500).send('<h1>Internal Server Error</h1>');
    }
});

// Members page
app.get('/members', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/');
    }
    const images = ['image1.jpg', 'image2.jpg', 'image3.jpg'];
    const randomImage = images[Math.floor(Math.random() * images.length)];
    const greeting = `Hello, ${req.session.user.name}!`;
    res.send(`
        <h1>${greeting}</h1>
        <img src="/${randomImage}" width="400" height="400" alt="Random Image" />
        <br>
        <button onclick="location.href='/logout'">Log Out</button>
    `);
});
// Logout
app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).send('<h1>Internal Server Error</h1>');
        }
        res.redirect('/');
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('<h1>Internal Server Error</h1>');
});

// 404 Not Found
app.use((req, res) => {
    res.status(404).send('<h1>404 Not Found</h1>');
});

// Connect to database
const { database } = require('./databaseConnection');
database.connect()
    .then(() => {
        console.log('Connected to MongoDB');
    })
    .catch(err => {
        console.error('Failed to connect to MongoDB', err);
    });

// Start the server
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});