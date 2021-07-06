const functions = require("firebase-functions");
const admin = require("firebase-admin");
const app = require("express")();

admin.initializeApp();

require('dotenv').config();

const firebaseConfig = {
    apiKey: process.env.API_KEY,
    authDomain: "newsletter-wm.firebaseapp.com",
    projectId: "newsletter-wm",
    storageBucket: "newsletter-wm.appspot.com",
    messagingSenderId: "571626044556",
    appId: "1:571626044556:web:afa6c3306cb641d1440fa9",
    measurementId: "G-F7N3MVRXMB"
};

const firebase = require("firebase");
firebase.initializeApp(firebaseConfig);

const db = admin.firestore();

app.get('/posts', (req, res) => {
    db
        .collection('posts')
        .orderBy('createdAt', 'desc')
        .get()
        .then((data) => {
            let posts = [];
            data.forEach((doc) => {
                posts.push({
                    postId: doc.id,
                    body: doc.data().body,
                    userHandle: doc.data().userHandle,
                    createdAt: doc.data().createdAt
                });
            });
            return res.json(posts);
        })
        .catch((err) => console.error(err));
})

const FBAuth = (req, res, next) => {
    let idToken;
    if(req.headers.authorization && req.headers.authorization.startsWith('Bearer ')){
        idToken = req.headers.authorization.split('Bearer ')[1];
    } else {
        console.error('No token found')
        return res.status(403).json({error: 'Unauthorized'});
    }

    admin.auth().verifyIdToken(idToken)
        .then((decodedToken) => {
            req.user = decodedToken;
            console.log(decodedToken);
            return db.collection('users')
                .where('userId', '==', req.user.uid)
                .limit(1)
                .get();
        })
        .then((data) => {
            req.user.handle = data.docs[0].data().handle;
            return next();
        })
        .catch((err) => {
            console.error('Error while verifyng token ', err);
            return res.status(403).json(err);
        })
}

// New Post
app.post('/post', FBAuth, (req, res) => {
    if(req.body.body.trim() === '') {
        return res.status(400).json({body: 'Must not be empty'});
    }

    const newPost = {
        body: req.body.body,
        userHandle: req.user.handle,
        createdAt: new Date().toISOString()
    };

    db
        .collection('posts')
        .add(newPost)
        .then((doc) => {
            res.json({
                message: `document ${doc.id} created succesfully`
            });
        })
        .catch((err) => {
            res.status(500).json({
                error: 'somenthing went wrong'
            });
            console.error(err)
        });
})

const isEmail = (email) => {
    const emailRegEx = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    if (email.match(emailRegEx)) return true;
    else return false;
}

const isEmpty = (string) => {
    if (string.trim() === '') return true;
    else return false;
}

// SignUp route
app.post('/signup', (req, res) => {
    const newUser = {
        email: req.body.email,
        password: req.body.password,
        confirmPassword: req.body.confirmPassword,
        handle: req.body.handle,
    }

    let errors = {};

    if (isEmpty(newUser.email)) {
        errors.email = 'Email must not be empty'
    } else if (!isEmail(newUser.email)) {
        errors.email = 'Must be a valid email address'
    }

    if (isEmpty(newUser.password)) errors.password = 'Must not be empty'

    if (newUser.password !== newUser.confirmPassword) errors.confirmPassword = 'Passwords must match';

    if (isEmpty(newUser.handle)) errors.handle = 'Must not be empty'

    if (Object.keys(errors).length > 0) return res.status(400).json(errors);

    //TODO: Validate the data
    let token, userId;
    db.doc(`/users/${newUser.handle}`).get()
        .then((doc) => {
            if (doc.exists) {
                return res.status(400).json({
                    handle: 'this handle is already taken'
                });
            } else {
                return firebase
                    .auth()
                    .createUserWithEmailAndPassword(newUser.email, newUser.password)
            }
        })
        .then((data) => {
            userId = data.user.uid;
            return data.user.getIdToken();
        })
        .then((idToken) => {
            token = idToken;
            const userCredentials = {
                handle: newUser.handle,
                email: newUser.email,
                createdAt: new Date().toISOString(),
                userId
            };
            return db.doc(`/users/${newUser.handle}`).set(userCredentials);
        })
        .then(() => {
            return res.status(201).json({
                token
            });
        })
        .catch((err) => {
            console.error(err);
            if (err.code === 'auth/email-already-in-use') {
                return res.status(400).json({
                    email: 'Email is already in use'
                })
            } else {
                return res.status(500).json({
                    error: err.code
                });
            }
        })
})

// LogIn Route
app.post('/login', (req, res) => {
    const user = {
        email: req.body.email,
        password: req.body.password
    };

    let errors = {};

    if (isEmpty(user.email)) errors.email = 'Must not be empty';
    if (isEmpty(user.password)) errors.password = 'Must not be empty';

    if (Object.keys(errors).length > 0) return res.status(400).json(errors);

    firebase.auth().signInWithEmailAndPassword(user.email, user.password)
        .then((data) => {
            return data.user.getIdToken();
        })
        .then((token) => {
            return res.json({
                token
            });
        })
        .catch((err) => {
            console.error(err);
            if (err.code === 'auth/wrong-password') {
                return res.status(403).json({
                    general: 'Wrong credentials, please try again'
                });
            } else return res.status(500).json({
                error: err.code
            });
        });
});


exports.api = functions.https.onRequest(app);