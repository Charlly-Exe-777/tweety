async function getFirebaseConfig() {
    try {
        const res = await fetch('/firebase-config');
        const data = await res.json();
        return data;
    } catch (error) {
        console.error('Error fetching Firebase config:', error);
        throw error;
    }
}

// Wait for Firebase scripts to load
async function waitForFirebase() {
    let attempts = 0;
    const maxAttempts = 50;
    
    while (!window.firebase && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
    }
    
    if (!window.firebase) {
        throw new Error('Firebase failed to initialize');
    }
}

// Add error notifications instead of alerts
function showError(message) {
    const loadingContainer = document.querySelector('.loading-container');
    if (loadingContainer) loadingContainer.style.display = 'none';
    console.error(message);
    alert(message); // Replace with a proper notification system later
}

async function initializeFirebase() {
    try {
        await waitForFirebase();
        const firebaseConfig = await getFirebaseConfig();
        
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        
        const auth = firebase.auth();
        const provider = new firebase.auth.GoogleAuthProvider();
        
        // Add these configurations
        provider.setCustomParameters({
            prompt: 'select_account',
            auth_type: 'reauthenticate'
        });
        
        // Add these OAuth scopes
        provider.addScope('profile');
        provider.addScope('email');

        return { auth, provider };
    } catch (error) {
        showError('Failed to initialize Firebase');
        throw error;
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const { auth, provider } = await initializeFirebase();
        const loginWithGoogleBtn = document.querySelector('.loginWithGoogleBtn');
        const loadingContainer = document.querySelector('.loading-container');
        
        if (loginWithGoogleBtn) {
            loginWithGoogleBtn.addEventListener('click', async () => {
                try {
                    if (loadingContainer) loadingContainer.style.display = 'flex';
                    
                    // Clear any existing auth state
                    await auth.signOut();
                    
                    // Set persistence before sign in
                    await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
                    
                    // Attempt sign in
                    const result = await auth.signInWithPopup(provider);
                    const user = result.user;
                    
                    if (!user) {
                        throw new Error('No user data returned');
                    }
                    
                    const idToken = await user.getIdToken(true);
                    localStorage.setItem('userToken', idToken);
                    localStorage.setItem('userEmail', user.email);
                    
                    // Verify with backend
                    const verifyResponse = await fetch('/check-user-login', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ token: idToken })
                    });

                    if (!verifyResponse.ok) {
                        throw new Error('Failed to verify token with server');
                    }

                    window.location.href = '/home';
                } catch (error) {
                    console.error('Auth Error:', error);
                    if (loadingContainer) loadingContainer.style.display = 'none';
                    alert(`Authentication failed: ${error.message}`);
                    localStorage.removeItem('userToken');
                    localStorage.removeItem('userEmail');
                }
            });
        }
        
        await checkUserLogin();
        changeHeaderTitle();
    } catch (error) {
        console.error('Initialization error:', error);
        const loadingContainer = document.querySelector('.loading-container');
        if (loadingContainer) {
            loadingContainer.style.display = 'none';
        }
    }
});

async function checkUserLogin(){
    const loadingContainer = document.querySelector('.loading-container');
    const userToken = localStorage.getItem('userToken');
    if(!userToken){
        console.log('User is not logged in');
        loadingContainer.style.display = 'none';
    }
    else{
        const res = await fetch('/check-user-login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ token: userToken })
        });
        const data = await res.json();
        if(data.authenticated){
            console.log(data.message);
            location.href = '/home';
        }
        else{
            localStorage.removeItem('userToken');
            console.log(data.message);
            loadingContainer.style.display = 'none';
        }
    }
}

function changeHeaderTitle() {
    const titles = [
        'Tweety: Make New Friends.',
        'Tweety: Chat With Your Friends.',
        'Tweety: Share Your Ideas.'
    ];
    let index = 0;

    function updateTitle() {
        const loginPageHeaderTitle = document.querySelector('.login-page-header-title');
        loginPageHeaderTitle.style.transition = 'opacity 0.5s ease-in-out';
        loginPageHeaderTitle.style.opacity = 0.3;
        setTimeout(() => {
            loginPageHeaderTitle.textContent = titles[index];
            loginPageHeaderTitle.style.opacity = 1;
            index = (index + 1) % titles.length;
        }, 500);
    }

    updateTitle();
    setInterval(updateTitle, 2000);
}