window.onload = function() {
  // Initialize Firebase
  firebase.initializeApp(firebaseConfig);

  // Check if the user is signed in
  firebase.auth().onAuthStateChanged(function(user) {
    if (user) {
      // User is signed in
      document.getElementById('user-info').innerHTML = `Signed in as: ${user.email}`;
      document.getElementById('login-btn').style.display = 'none';
      document.getElementById('logout-btn').style.display = 'inline-block';
    } else {
      // User is signed out
      document.getElementById('login-btn').style.display = 'inline-block';
      document.getElementById('logout-btn').style.display = 'none';
    }
  });

  // Initialize game
  main();
};