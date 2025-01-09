import { showNotification } from './notifications.js';

// Utility functions
function handleError(error) {
    console.error('An error occurred:', error);
    showNotification(error.message || 'An error occurred', 'error');
}

function scrollToBottom(element) {
    if (element) {
        element.scrollTop = element.scrollHeight;
    }
}

function updateCommentsCounter(postID, count) {
    const commentBtn = document.querySelector(`.tweet-comments-btn.${postID}`);
    if (commentBtn) {
        const countElement = commentBtn.querySelector('i');
        if (countElement) countElement.textContent = count;
    }
}

// Add error handler utility
const handleAPIError = (error, fallbackMessage) => {
    console.error(error);
    showNotification(error.message || fallbackMessage, 'error');
};

// Add cache for user data
const userCache = new Map();

async function getUserData(uid) {
    if (userCache.has(uid)) {
        return userCache.get(uid);
    }
    // ...fetch user data...
    userCache.set(uid, userData);
    return userData;
}

// Authentication
async function checkUserLogin() {
    const userToken = localStorage.getItem('userToken');
    if (!userToken) {
        showNotification('Please login first', 'error');
        window.location.href = '/';
        return;
    }

    try {
        const res = await fetch('/check-user-login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ token: userToken })
        });

        if (!res.ok) throw new Error('Authentication failed');

        const data = await res.json();
        if (data.authenticated) {
            console.log(data.message);
            updateUserProfileImage(data.userImg);
        } else {
            console.log(data.message);
            window.location.href = '/';
        }
    } catch (error) {
        handleError(error);
    }
}

function updateUserProfileImage(imageUrl) {
    const userImg = document.querySelector('.user-img');
    const userImgInHome = document.querySelector('.user-img-in-home');
    if (userImg) userImg.src = imageUrl;
    if (userImgInHome) userImgInHome.src = imageUrl;
}

// UI Manipulation
function toggleTweetContainer(display) {
    const newTweetContainer = document.querySelector('.new-tweet-container');
    if (newTweetContainer) newTweetContainer.style.display = display;
}

// Event Listeners
function setupEventListeners() {
    const newTweet = document.querySelector('.new-tweet');
    const closeTweetSection = document.querySelector('.close-tweet-section');
    const addTweetContainer = document.querySelector('.add-tweet-container-parent');

    if (newTweet) newTweet.addEventListener('click', () => toggleTweetContainer('flex'));
    if (closeTweetSection) closeTweetSection.addEventListener('click', () => toggleTweetContainer('none'));
    if (addTweetContainer) addTweetContainer.addEventListener('click', () => toggleTweetContainer('flex'));
}

// Posting a Tweet
async function postTweet() {
    const postTweetBtn = document.querySelector('.post-tweet-btn');
    if (!postTweetBtn) return;

    postTweetBtn.addEventListener('click', async () => {
        const tweetInput = document.querySelector('.tweet-input');
        if (!tweetInput) return;

        const tweet = tweetInput.value;
        try {
            const res = await fetch('/user-new-post', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ tweet, userToken: localStorage.getItem('userToken') })
            });

            const data = await res.json();
            if (res.status !== 200) {
                showNotification(data.message, 'error');
            } else {
                showNotification(data.message, 'success');
                location.reload();
            }
            tweetInput.value = '';
            toggleTweetContainer('none');
        } catch (error) {
            handleError(error);
        }
    });
}

// Fetching and Displaying Tweets
async function getAllUsersTweets() {
    const tweetsContainer = document.querySelector('.tweets-container');
    if (!tweetsContainer) return;

    try {
        const res = await fetch('/all-users-tweets', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ token: localStorage.getItem('userToken') })
        });

        if (!res.ok) throw new Error('Failed to fetch tweets');

        const data = await res.json();
        const tweetsArray = data.tweets;
        const fragment = document.createDocumentFragment();

        tweetsArray.forEach(tweet => {
            const tweetHtml = createTweetElement(tweet);
            fragment.appendChild(tweetHtml);
        });

        tweetsContainer.innerHTML = '';
        tweetsContainer.appendChild(fragment);
        likePostsOrDislike();
        getTweetComments();
    } catch (error) {
        handleError(error);
    }
}

function createTweetElement(tweet) {
    const div = document.createElement('div');
    div.className = 'user-tweet-container';
    div.innerHTML = `
        <div class="user-name-and-img">
            <img src="${tweet.userProfileUrl}" alt="user-img-inPOST" class="user-img-inPOST">
            <p class="user-name-inPOST">${tweet.username}</p>
        </div>
        <div class="user-tweet">${tweet.tweet}</div>
        <span class="tweet-comments-btn ${tweet.id}"><span class="iconify" data-icon="mdi:comment"></span><i>${tweet.commentsCount}</i></span>
        <span class="like-tweet ${tweet.isLiked ? 'liked-tweet' : 'unliked-tweet'}" id="${tweet.id}"><span class="material-symbols-outlined">favorite</span><i>${tweet.postLikes}</i></span>
    `;
    return div;
}

// Like/Dislike Functionality
async function likeAndDislikeTweet(postID) {
    try {
        const res = await fetch('/like-or-dislike-tweet', {
            method: "POST",
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                postID: postID,
                userToken: localStorage.getItem('userToken'),
            })
        });

        if (!res.ok) throw new Error('Failed to like/dislike tweet');

        const data = await res.json();
        showNotification(data.message, data.liked ? 'success' : 'info');
        return data.likesCount;
    } catch (error) {
        handleError(error);
    }
}

function likePostsOrDislike() {
    document.querySelectorAll('.like-tweet').forEach(btn => {
        btn.addEventListener('click', async () => {
            const postID = btn.id;
            const likesCount = await likeAndDislikeTweet(postID);
            if (likesCount !== undefined) {
                btn.innerHTML = `<span class="material-symbols-outlined">favorite</span><i>${likesCount}</i>`;
                btn.classList.toggle('liked-tweet');
                btn.classList.toggle('unliked-tweet');
            }
        });
    });
}

// Comment Functionality
const tweetCommentsContainer = document.querySelector('.tweetCommentsContainer');
const tweetCommentsRoot = document.querySelector('.tweetCommentsRoot');
const closeCommentsContainer = document.querySelector('.closeCommentsContainer');
const currentTweetCommentsContainer = document.querySelector('.currentTweetCommentsContainer');
const noCommentsContainer = document.querySelector('.noCommentsContainer');

let currentPostID = null; // To keep track of the current post being commented on

async function getTweetComments() {
    document.querySelectorAll('.tweet-comments-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (tweetCommentsContainer) tweetCommentsContainer.style.display = 'flex';

            const currentTweet = btn.parentElement;
            if (tweetCommentsRoot) tweetCommentsRoot.appendChild(currentTweet);

            if (closeCommentsContainer) {
                closeCommentsContainer.addEventListener('click', () => {
                    const tweetsContainer = document.querySelector('.tweets-container');
                    if (tweetsContainer) tweetsContainer.appendChild(currentTweet);
                    if (tweetCommentsContainer) tweetCommentsContainer.style.display = 'none';
                }, { once: true });
            }

            currentPostID = btn.classList[1]; // Store the current post ID
            try {
                const comments = await getTweetCommentsFromDB(currentPostID);
                if (comments.length === 0) {
                    showNotification('No comments yet', 'info');
                }
                updateCommentsDisplay(comments, currentPostID);
                updateCommentsCounter(currentPostID, comments.length);
                // Initialize comment posting functionality after opening comments
                postTweetComment();
            } catch (error) {
                handleError(error);
            }
        });
    });
}

async function getTweetCommentsFromDB(postID) {
    const res = await fetch('/get-tweet-comments', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ postID, userToken: localStorage.getItem('userToken') })
    });

    if (!res.ok) throw new Error('Failed to fetch comments');

    const data = await res.json();
    return data.comments;
}

function updateCommentsDisplay(comments, postID) {
    if (noCommentsContainer) {
        noCommentsContainer.innerHTML = comments.length ? comments.map(comment => `
            <div class="userComment">
                <div class="commentHeader">
                    <img src="${escapeHtml(comment.userImg)}" alt="user" class="commentUserImg">
                    <span class="commentUserName">@${escapeHtml(comment.userName)}</span>
                </div>
                <p class="userCommentContent">${escapeHtml(comment.text)}</p>
            </div>
        `).join('') : '<p>Be The First To Comment</p>';
    }
}

// Add this security utility function
function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

async function postTweetComment() {
    const postCommentBtn = document.querySelector('.addCommentBtn');
    const commentInput = document.querySelector('.addCommentInput');

    if (postCommentBtn && commentInput && noCommentsContainer) {
        // Remove any existing event listeners
        postCommentBtn.replaceWith(postCommentBtn.cloneNode(true));
        const newPostCommentBtn = document.querySelector('.addCommentBtn');
        
        newPostCommentBtn.addEventListener('click', async (event) => {
            event.preventDefault();
            const comment = commentInput.value.trim();
            if (comment === '') return;

            try {
                const res = await fetch('/post-tweet-comment', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        comment,
                        postID: currentPostID,
                        userToken: localStorage.getItem('userToken')
                    })
                });

                const data = await res.json();
                if (!res.ok) {
                    showNotification(data.message || 'Failed to post comment', 'error');
                    return;
                }

                showNotification('Comment posted successfully', 'success');
                commentInput.value = '';
                const comments = await getTweetCommentsFromDB(currentPostID);
                updateCommentsDisplay(comments, currentPostID);
                updateCommentsCounter(currentPostID, comments.length);
                scrollToBottom(currentTweetCommentsContainer);
            } catch (error) {
                showNotification('Failed to post comment. Please try again.', 'error');
            }
        });
    }
}

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    checkUserLogin();
    setupEventListeners();
    postTweet();
    getAllUsersTweets();
    checkUserProfile(); // Add this line
});

// Add these functions after initialization
async function checkUserProfile() {
    try {
        const res = await fetch('/get-user-profile', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ userToken: localStorage.getItem('userToken') })
        });

        const data = await res.json();
        if (!data.profileExists) {
            showUserInfoModal();
        }
    } catch (error) {
        handleError(error);
    }
}

function showUserInfoModal() {
    const modal = document.querySelector('.user-info-modal');
    modal.style.display = 'flex';
    setupUserInfoForm();
}

function setupUserInfoForm() {
    const form = document.getElementById('userInfoForm');
    const bioInput = document.getElementById('userBio');
    const bioCounter = document.querySelector('.bio-counter');

    bioInput.addEventListener('input', () => {
        const count = bioInput.value.length;
        bioCounter.textContent = `${count}/150`;
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = {
            name: document.getElementById('userName').value,
            age: document.getElementById('userAge').value,
            bio: bioInput.value,
            userToken: localStorage.getItem('userToken')
        };

        try {
            const res = await fetch('/save-user-profile', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            });

            const data = await res.json();
            if (data.success) {
                document.querySelector('.user-info-modal').style.display = 'none';
                showNotification('Profile updated successfully', 'success');
            }
        } catch (error) {
            handleError(error);
        }
    });
}

// export functions to profile.js

export {
    handleError,
    scrollToBottom,
    updateCommentsCounter,
    getTweetCommentsFromDB,
    updateCommentsDisplay,
    postTweetComment,
    showNotification
}