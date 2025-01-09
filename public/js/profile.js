import {
    handleError,
    scrollToBottom,
    updateCommentsCounter,
    getTweetCommentsFromDB,
    updateCommentsDisplay, // Keep this import
    showNotification,
    postTweetComment
} from './home.js';

// Utility functions
function toggleTweetContainer(display) {
    const newTweetContainer = document.querySelector('.new-tweet-container');
    if (newTweetContainer) newTweetContainer.style.display = display;
}

// Function to get user tweets and user info
async function getUserTweetsAndUserInfo(){
    if(localStorage.userToken === null || localStorage.userToken === undefined){
        showNotification('Please login first', 'error');
        location.href = '/';
        return;
    }

    const loadingContainer = document.querySelector('.loading-container');
    try {
        const res = await fetch('/get-user-tweets', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                userToken: localStorage.getItem('userToken'),
            })
        });

        if (!res.ok) throw new Error('Failed to fetch user tweets');

        const data = await res.json();
        if(res.status !== 200){
            loadingContainer.style.display = 'none';
            console.error(data.message);
            console.error('No tweets found');
            return;
        }
        
        const userProfileUrl = data.userProfileUrl;
        const userName = data.username;
        const tweetsArray = data.tweets;
        const userEmail = data.userEmail;

        // Get comments count for each tweet
        for (let tweet of tweetsArray) {
            const comments = await getTweetCommentsFromDB(tweet.id);
            tweet.commentsCount = comments.length;
        }

        const userTweetsContainer = document.querySelector('.user-tweets-container');
        if(userTweetsContainer){
            const fragment = document.createDocumentFragment();
            tweetsArray.forEach(tweet => {
                const tweetHtml = createTweetElement(tweet, userProfileUrl, userName, userEmail);
                fragment.appendChild(tweetHtml);
            });
            userTweetsContainer.innerHTML = '';
            userTweetsContainer.appendChild(fragment);
        }

        loadingContainer.style.display = 'none';
        updateUserProfile(userProfileUrl);

        deleteTweet();
        likePostsOrDislike();
        getTweetComments(); // Initialize comment functionality for each tweet
    } catch (error) {
        handleError(error);
        loadingContainer.style.display = 'none';
    }
}

function createTweetElement(tweet, userProfileUrl, userName, userEmail) {
    const div = document.createElement('div');
    div.className = 'user-tweet-container';
    div.innerHTML = `
        <div class="user-name-and-img">
            <img src="${userProfileUrl}" alt="user-img-inPOST" class="user-img-inPOST">
            <p class="user-name-inPOST">${userName}</p>
        </div>
        <div class="user-tweet">${escapeHtml(tweet.tweet)}</div>
        <span class="delete-tweet" id="${tweet.id}"><span class="material-symbols-outlined">delete</span></span>
        <span class="tweet-comments-btn ${tweet.id}"><span class="iconify" data-icon="mdi:comment"></span><i>${tweet.commentsCount || 0}</i></span>
        <span class="like-tweet ${tweet.likes.includes(userEmail) ? 'liked-tweet' : 'unliked-tweet'}" id="${tweet.id}"><span class="material-symbols-outlined">favorite</span><i>${tweet.likes.length - 1}</i></span>
    `;
    return div;
}

// Add security utility function
function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

async function updateUserProfile(userProfileUrl) {
    try {
        const res = await fetch('/get-user-profile', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ userToken: localStorage.getItem('userToken') })
        });

        const data = await res.json();
        if (data.profileExists) {
            const { name, age, bio } = data.profile;
            document.querySelector('.user-name').textContent = '@' + name;
            document.querySelector('.user-age').textContent = `${age} years old`;
            document.querySelector('.user-bio').textContent = bio;
        }

        const userImg = document.querySelector('.user-pfp-img');
        const userIMG = document.querySelector('.user-img');
        if(userImg) userImg.src = userProfileUrl;
        if(userIMG) userIMG.src = userProfileUrl;

        setupEditButton(data.profile);
    } catch (error) {
        handleError(error);
    }
}

function setupEditButton(profile) {
    const editBtn = document.querySelector('.edit-profile-btn');
    if (!editBtn) return;

    editBtn.addEventListener('click', () => {
        const modal = createEditModal(profile);
        document.body.appendChild(modal);
        modal.style.display = 'flex';
    });
}

function createEditModal(profile) {
    const modal = document.createElement('div');
    modal.className = 'user-info-modal';
    modal.innerHTML = `
        <div class="user-info-content">
            <h2>Edit Profile</h2>
            <form>
                <div class="form-group">
                    <input type="text" id="userName" required minlength="3" maxlength="20" value="${profile?.name || ''}">
                    <label for="userName">Username</label>
                </div>
                <div class="form-group">
                    <input type="number" id="userAge" required min="13" max="100" value="${profile?.age || ''}">
                    <label for="userAge">Age</label>
                </div>
                <div class="form-group">
                    <textarea id="userBio" required maxlength="150">${profile?.bio || ''}</textarea>
                    <label for="userBio">Bio</label>
                    <span class="bio-counter">${(profile?.bio?.length || 0)}/150</span>
                </div>
                <button type="submit" class="submit-btn">Save Changes</button>
                <button type="button" class="cancel-btn" onclick="this.closest('.user-info-modal').remove()">Cancel</button>
            </form>
        </div>
    `;

    setupEditForm(modal);
    return modal;
}

function setupEditForm(modal) {
    // Change from #editProfileForm to form directly since we're creating a new modal
    const form = modal.querySelector('form');
    const bioInput = modal.querySelector('#userBio');
    const bioCounter = modal.querySelector('.bio-counter');

    bioInput.addEventListener('input', () => {
        const count = bioInput.value.length;
        bioCounter.textContent = `${count}/150`;
    });

    // Change from modal.querySelector('#userInfoForm') to form
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = {
            name: modal.querySelector('#userName').value,
            age: modal.querySelector('#userAge').value,
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
                modal.remove();
                showNotification('Profile updated successfully', 'success');
                // Refresh profile data
                location.reload();
            } else {
                showNotification('Failed to update profile', 'error');
            }
        } catch (error) {
            handleError(error);
            showNotification('Failed to update profile', 'error');
        }
    });
}

// UI Manipulation for New Tweet Modal
const newTweetContainer = document.querySelector('.new-tweet-container');
const closeTweetSection = document.querySelector('.close-tweet-section');
const newTweet = document.querySelector('.new-tweet');

if (newTweet) newTweet.addEventListener('click', () => toggleTweetContainer('flex'));
if (closeTweetSection) closeTweetSection.addEventListener('click', () => toggleTweetContainer('none'));

// Delete Tweet Functionality
async function deletePostByID(id){
    try {
        const res = await fetch('/delete-post-by-id', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                postID: id,
                userToken: localStorage.getItem('userToken'),
             })
        });
        const data = await res.json();
        if(res.status !== 200){
            showNotification(data.message, 'error');
        }
        else{
            showNotification(data.message, 'success');
            location.reload();
        }
    } catch (error) {
        handleError(error);
    }
}

function deleteTweet(){
    document.querySelectorAll('.delete-tweet').forEach(deleteTweetBtn => {
        deleteTweetBtn.addEventListener('click', async () => {
            const tweetID = deleteTweetBtn.id;
            await deletePostByID(tweetID);
        });
    });
}

// Like/Dislike Functionality
async function likeAndDislikeTweet(postID){
    try {
        const res = await fetch('/like-or-dislike-tweet', {
            method: "POST",
            headers:{
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

function likePostsOrDislike(){
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
let currentPostID = null;
const tweetCommentsContainer = document.querySelector('.tweetCommentsContainer');
const tweetCommentsRoot = document.querySelector('.tweetCommentsRoot');
const closeCommentsContainer = document.querySelector('.closeCommentsContainer');
const currentTweetCommentsContainer = document.querySelector('.currentTweetCommentsContainer');
const noCommentsContainer = document.querySelector('.noCommentsContainer');

function getTweetComments() {
    document.querySelectorAll('.tweet-comments-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (tweetCommentsContainer) tweetCommentsContainer.style.display = 'flex';

            const currentTweet = btn.parentElement;
            if (tweetCommentsRoot) tweetCommentsRoot.appendChild(currentTweet);

            if (closeCommentsContainer) {
                closeCommentsContainer.addEventListener('click', () => {
                    const userTweetsContainer = document.querySelector('.user-tweets-container');
                    if (userTweetsContainer) userTweetsContainer.appendChild(currentTweet);
                    if (tweetCommentsContainer) tweetCommentsContainer.style.display = 'none';
                }, { once: true });
            }

            currentPostID = btn.classList[1];
            try {
                const comments = await getTweetCommentsFromDB(currentPostID);
                if (comments.length === 0) {
                    showNotification('No comments yet', 'info');
                }
                updateCommentsDisplay(comments, currentPostID);
                updateCommentsCounter(currentPostID, comments.length);
                setupCommentForm();
            } catch (error) {
                handleError(error);
            }
        });
    });
}

// Add this new function to handle the comment form submission
function setupCommentForm() {
    const addCommentBtn = document.querySelector('.addCommentBtn');
    const addCommentInput = document.querySelector('.addCommentInput');

    if (addCommentBtn && addCommentInput) {
        // Remove any existing event listeners
        addCommentBtn.replaceWith(addCommentBtn.cloneNode(true));
        const newAddCommentBtn = document.querySelector('.addCommentBtn');
        
        newAddCommentBtn.addEventListener('click', async () => {
            const comment = addCommentInput.value.trim();
            if (!comment || !currentPostID) return;

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
                addCommentInput.value = '';
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
    getUserTweetsAndUserInfo();
    setupCommentForm();
});