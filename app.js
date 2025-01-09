import admin from 'firebase-admin';
import serviceAccount from './firebaseAdminConfig.json' assert { type: 'json' };
import express from 'express';
import { fileURLToPath } from 'url';
import path, { dirname } from 'path';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { GoogleGenerativeAI } from '@google/generative-ai';

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://tweety-151d7-default-rtdb.europe-west1.firebasedatabase.app"
});

dotenv.config();

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'js')));
app.use(express.static(path.join(__dirname, 'src')));
app.use(express.json());

// Add rate limiting with proper configuration for ESM
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false
});

// Apply rate limiter to all routes
app.use(limiter);

// Remove unused security headers since we're disabling CSP
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
    crossOriginResourcePolicy: false
}));

// Simplify CORS headers
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    next();
});

// Add favicon route
app.get('/favicon.ico', (req, res) => {
    res.status(204).end();
});

app.get('/', (req, res) => {
    res.sendFile('/public/login.html', {root: __dirname});
})

app.get('/home', (req, res) => {
    res.sendFile('/public/home.html', {root: __dirname});
  })
  
app.get('/profile', (req, res) => {
    res.sendFile('/public/profile.html', {root: __dirname});
})

app.get('/firebase-config', (req, res) => {
  res.json({
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: "tweety-151d7",
    storageBucket: "tweety-151d7.firebasestorage.app",
    messagingSenderId: "355904383366",
    appId: "1:355904383366:web:bdcd84bf8096225c996407"
  });
});

app.post('/check-user-login', async (req, res) => {
    try {
        const idToken = req.body.token;
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const uid = decodedToken.uid;
        const user = await admin.auth().getUser(uid);
        const userName = user.displayName;
        const userImg = user.photoURL;
        res.status(200).json({
            message: userName+' is authenticated',
            authenticated: true,
            userImg: userImg
        });
    } catch (error) {
        res.status(401).json({
            message: 'User is not authenticated',
            authenticated: false
        });
    }
});

// set up firebase database
const db = admin.database();
const usersTweetsRef = db.ref('usersTweets');
const usersProfilesRef = db.ref('usersProfiles'); // Keep this declaration

// Add input validation
function validateTweet(tweet) {
    return tweet && tweet.length <= 280;
}

// push user new post to database
app.post('/user-new-post', async (req, res) => {
    const userTweet = req.body.tweet;
    if (!validateTweet(userTweet)) {
        return res.status(400).json({
            message: 'Invalid tweet',
            type: 'error'
        });
    }
    
    try {
        const decodedToken = await admin.auth().verifyIdToken(req.body.userToken);
        const uid = decodedToken.uid;
        const user = await admin.auth().getUser(uid);
        const userEmailAsId = user.email;

        // Get user profile
        const userProfileSnapshot = await usersProfilesRef.child(userEmailAsId.replace('.', '_')).once('value');
        const userProfile = userProfileSnapshot.val();
        
        if (!userProfile) {
            return res.status(401).json({ 
                message: 'Please complete your profile first', 
                type: 'error' 
            });
        }

        await usersTweetsRef.push({
            id: userEmailAsId,
            tweet: userTweet,
            likes: [uid],
            comments: [uid],
            userName: userProfile.name
        });

        return res.status(200).json({ 
            message: 'Tweet posted successfully!', 
            type: 'success' 
        });
    } catch (error) {
        console.error('Tweet posting error:', error);
        return res.status(500).json({ 
            message: 'Failed to post tweet', 
            type: 'error'
        });
    }
});

// get user tweets by id.
app.post('/get-user-tweets', async (req, res) => {
    const userToken = req.body.userToken;
    try {
        const decodedToken = await admin.auth().verifyIdToken(userToken);
        const uid = decodedToken.uid;
        const user = await admin.auth().getUser(uid);
        const userProfileUrl = user.photoURL;
        const userName = user.displayName;
        const userEmailAsId = user.email;
        
        const userProfileSnapshot = await usersProfilesRef.child(userEmailAsId.replace('.', '_')).once('value');
        const userProfile = userProfileSnapshot.val();
        
        const snapshot = await usersTweetsRef.orderByChild('id').equalTo(userEmailAsId).once('value');
        const tweets = snapshot.val();

        const userTweets = [];
        for (let key in tweets) {
            // Get comments count
            const commentsSnapshot = await usersTweetsRef.child(key).child('comments').once('value');
            const comments = commentsSnapshot.val() || {};
            const commentsCount = Object.keys(comments).length - 1; // Subtract 1 for initial comment

            userTweets.push({
                id: key, 
                tweet: tweets[key].tweet,
                likes: tweets[key].likes,
                commentsCount: Math.max(0, commentsCount) // Ensure non-negative count
            });
        }
        res.status(200).json({
            tweets: userTweets,
            userProfileUrl: userProfileUrl,
            username: userProfile?.name || userName, // Use custom username if available
            userEmail: userEmailAsId,
        });
    } catch (error) {
        res.status(500).json({ 
            message: 'Could not fetch your tweets. Please try again.',
            type: 'error'
        });
    }
});



// like and dislike tweet.
app.post('/like-or-dislike-tweet', async (req, res) => {
    const tweetID = req.body.postID;
    const userToken = req.body.userToken;

    try {
        // Verify user
        const decodedToken = await admin.auth().verifyIdToken(userToken);
        const uid = decodedToken.uid;
        const user = await admin.auth().getUser(uid);
        const userEmailAsId = user.email;

        if (userEmailAsId === undefined || null) {
            return res.status(401).json({ message: 'User is not authenticated' });
        }

        const tweetRef = usersTweetsRef.child(tweetID);
        const snapshot = await tweetRef.once('value');
        const tweet = snapshot.val();
        if (!tweet) {
            return res.status(404).json({ message: 'Tweet not found' });
        }

        // Get likes reference
        const likesRef = tweetRef.child('likes');
        const likesSnapshot = await likesRef.once('value');
        const likesArray = likesSnapshot.val();

        // Check if user already liked the tweet
        const userLikeIndex = likesArray.indexOf(userEmailAsId);

        if (userLikeIndex === -1) {
            // User hasn't liked - add like
            likesArray.push(userEmailAsId);
            await likesRef.set(likesArray);
            res.status(200).json({ message: 'Tweet liked successfully', liked: true, likesCount: likesArray.length -1 });
        } else {
            // User already liked - remove like
            // Remove the user's like from the likes array
            likesArray.splice(userLikeIndex, 1);
            await likesRef.set(likesArray);
            res.status(200).json({ message: 'Tweet unliked successfully', liked: false, likesCount: likesArray.length -1 });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ 
            message: 'Could not process your like. Please try again.',
            type: 'error'
        });
    }
});

// delete user tweet by id
app.post('/delete-post-by-id', async (req, res) => {
    const postID = req.body.postID;
    const userToken = req.body.userToken;
    try {
        const decodedToken = await admin.auth().verifyIdToken(userToken);
        const uid = decodedToken.uid;
        const user = await admin.auth().getUser(uid);
        const userEmailAsId = user.email;
        // check if the user is the owner of the tweet
        const snapshot = await usersTweetsRef.orderByChild('id').equalTo(userEmailAsId).once('value');
        const tweets = snapshot.val();
        if (!tweets || !tweets[postID] || tweets[postID].id !== userEmailAsId) {
            return res.status(401).json({ message: 'User is not authorized to delete this tweet' });
        }
        await usersTweetsRef.child(postID).remove();
        return res.status(200).json({ message: 'Tweet deleted successfully' });
    } catch (error) {
        return res.status(500).json({ 
            message: 'Could not delete tweet. Please try again.',
            type: 'error' 
        });
    }
});


// get all users tweets to show it on the home page
app.post('/all-users-tweets', async (req, res) => {
    const userToken = req.body.token;
    const decodedToken = await admin.auth().verifyIdToken(userToken);
    const uid = decodedToken.uid;
    const user = await admin.auth().getUser(uid);
    const userEmail = user.email;
    if(userEmail === null || undefined){
        return res.status(401).json({ message: 'User is not authenticated' });
    }
    try {
        const snapshot = await usersTweetsRef.once('value');
        const tweets = snapshot.val();
        const usersTweets = [];
        for (let key in tweets) {

            const user = await admin.auth().getUser(tweets[key].likes[0]);
            const userImg = user.photoURL;
            const usersWhoLikesArray = tweets[key].likes;
            //get comments count
            const commentsCountArray = Object.values(tweets[key].comments);
            usersTweets.push({
                id: key,
                tweet: tweets[key].tweet,
                usersWhoLikesArray: tweets[key].likes,
                postLikes: tweets[key].likes.length - 1,
                isLiked: usersWhoLikesArray.includes(userEmail),
                userProfileUrl: userImg,
                username: tweets[key].userName || user.displayName, // Use custom username if available
                commentsCount: commentsCountArray.length - 1
            });
        }
        res.status(200).json({
            tweets: usersTweets,
        });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching tweets' });
        console.log(error);
    }
});

// post tweet comment
app.post('/post-tweet-comment', async (req, res) => {
    const { comment, postID, userToken } = req.body;
    try {
        const decodedToken = await admin.auth().verifyIdToken(userToken);
        const uid = decodedToken.uid;
        const user = await admin.auth().getUser(uid);
        const userEmailAsId = user.email;

        // Get user profile for name
        const userProfileSnapshot = await usersProfilesRef.child(userEmailAsId.replace('.', '_')).once('value');
        const userProfile = userProfileSnapshot.val();

        if (!userProfile) {
            return res.status(401).json({ message: 'Please complete your profile first' });
        }

        // Get tweet reference and check if it exists
        const tweetRef = usersTweetsRef.child(postID);
        const tweetSnapshot = await tweetRef.once('value');
        if (!tweetSnapshot.exists()) {
            return res.status(404).json({ message: 'Tweet not found' });
        }

        // Get comments reference
        const commentsRef = tweetRef.child('comments');
        const commentsSnapshot = await commentsRef.once('value');
        const comments = commentsSnapshot.val() || { '0': uid };

        const commentData = {
            text: comment,
            userName: userProfile.name, // Use profile name instead of display name
            userImg: user.photoURL,
            userId: userEmailAsId,
            timestamp: Date.now()
        };
        await commentsRef.push(commentData);

        return res.status(200).json({ 
            message: 'Comment posted successfully',
            comment: commentData
        });
    } catch (error) {
        console.error('Error posting comment:', error);
        return res.status(500).json({ 
            message: 'Error posting comment',
            error: error.message 
        });
    }
});

// get tweet comments
app.post('/get-tweet-comments', async (req, res) => {
    const postID = req.body.postID;
    const userToken = req.body.userToken;
    try {
        const decodedToken = await admin.auth().verifyIdToken(userToken);
        const uid = decodedToken.uid;
        const user = await admin.auth().getUser(uid);
        const userEmailAsId = user.email;
        
        if(!user.email || userEmailAsId === null || userEmailAsId === undefined){
            return res.status(401).json({ message: 'User is not authenticated' });
        }
        
        // get tweet comments
        const tweetCommentsRef = usersTweetsRef.child(postID).child('comments');
        const snapshot = await tweetCommentsRef.once('value');
        let tweetComments = snapshot.val();

        if (tweetComments === null) {
            return res.status(200).json({ comments: [] }); // No comments exist
        }

        // Convert object to array and remove the first comment (initial comment)
        let tweetCommentsArray = Object.values(tweetComments);
        tweetCommentsArray = tweetCommentsArray.slice(1);
        
        return res.status(200).json({ comments: tweetCommentsArray });
    } catch (error) {
        console.error('Error fetching comments:', error);
        return res.status(500).json({ message: 'Error getting tweet comments' });
    }
});

app.post('/get-user-profile', async (req, res) => {
    try {
        const decodedToken = await admin.auth().verifyIdToken(req.body.userToken);
        const userEmail = decodedToken.email;
        
        const snapshot = await usersProfilesRef.child(userEmail.replace('.', '_')).once('value');
        const profile = snapshot.val();
        
        res.json({ 
            profileExists: !!profile,
            profile: profile || null
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});

app.post('/save-user-profile', async (req, res) => {
    try {
        const { name, age, bio, userToken } = req.body;
        const decodedToken = await admin.auth().verifyIdToken(userToken);
        const userEmail = decodedToken.email;
        const userEmailKey = userEmail.replace('.', '_');
        
        // Save profile
        await usersProfilesRef.child(userEmailKey).set({
            name,
            age: parseInt(age),
            bio,
            email: userEmail
        });

        // Update username in all user's tweets
        const tweetsSnapshot = await usersTweetsRef.orderByChild('id').equalTo(userEmail).once('value');
        const tweets = tweetsSnapshot.val();
        
        if (tweets) {
            const updates = {};
            Object.keys(tweets).forEach(tweetId => {
                updates[`${tweetId}/userName`] = name;
            });
            await usersTweetsRef.update(updates);
        }
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to save profile' });
    }
});

// Improve error handling
app.use((err, req, res, next) => {
    console.error('Server Error:', err.stack);
    res.status(500).json({
        message: 'Internal server error',
        type: 'error'
    });
});

app.get('/gemini', (req, res) => {
    res.sendFile('/public/gemini.html', {root: __dirname});
});

const genAI = new GoogleGenerativeAI('AIzaSyC3eW-SrlCDHjU5xT76GTXN164cNbFQEUA');

// Update the gemini-chat endpoint
app.post('/gemini-chat', async (req, res) => {
    try {
        const idToken = req.headers.authorization?.split('Bearer ')[1];
        if (!idToken) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        await admin.auth().verifyIdToken(idToken);
        
        // Use gemini-pro model with safety settings for free tier
        const model = genAI.getGenerativeModel({ 
            model: "gemini-pro",
            safetySettings: [
                {
                    category: "HARM_CATEGORY_HARASSMENT",
                    threshold: "BLOCK_MEDIUM_AND_ABOVE",
                },
                {
                    category: "HARM_CATEGORY_HATE_SPEECH",
                    threshold: "BLOCK_MEDIUM_AND_ABOVE",
                },
                {
                    category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                    threshold: "BLOCK_MEDIUM_AND_ABOVE",
                },
                {
                    category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                    threshold: "BLOCK_MEDIUM_AND_ABOVE",
                },
            ],
        });

        try {
            const result = await model.generateContent({
                contents: [{ role: "user", parts: [{ text: req.body.message }]}],
                generationConfig: {
                    temperature: 0.7,
                    topK: 40,
                    topP: 0.95,
                    maxOutputTokens: 1024,
                }
            });

            const response = await result.response;
            const text = response.text();
            
            return res.status(200).json({
                text: text,
                type: text.includes('```') ? 'code' : 'text',
                isExplanation: text.toLowerCase().includes('explanation:') || text.toLowerCase().includes('here\'s how:')
            });
        } catch (genError) {
            console.error('Gemini generation error:', genError);
            return res.status(500).json({ 
                error: 'Failed to generate response',
                details: genError.message 
            });
        }
    } catch (error) {
        console.error('Authentication error:', error);
        return res.status(401).json({ error: 'Authentication failed' });
    }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on Port ${PORT}`);
});