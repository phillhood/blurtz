// Test user credentials
export const testUser = {
  username: `testuser_${Date.now()}`,
  password: "testPassword123!",
};

export const existingUser = {
  username: "existinguser",
  password: "password123",
};

// Test game data
export const testGame = {
  name: "Test Game",
  maxPlayers: 4,
  isPrivate: false,
};

export const privateGame = {
  name: "Private Test Game",
  maxPlayers: 2,
  isPrivate: true,
};
