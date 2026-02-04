/**
 * PE OS - Frontend Smoke Tests
 * Basic tests to verify critical user flows work
 */

import { test, expect } from '@playwright/test';

test.describe('Landing Page', () => {
  test('should load the landing page', async ({ page }) => {
    await page.goto('/');

    // Check page title
    await expect(page).toHaveTitle(/PE OS/);

    // Check main heading exists
    const heading = page.locator('h1');
    await expect(heading).toBeVisible();
  });

  test('should have navigation links', async ({ page }) => {
    await page.goto('/');

    // Check login link exists
    const loginLink = page.locator('a[href*="login"]');
    await expect(loginLink).toBeVisible();

    // Check signup link exists
    const signupLink = page.locator('a[href*="signup"]');
    await expect(signupLink).toBeVisible();
  });
});

test.describe('Login Page', () => {
  test('should load the login page', async ({ page }) => {
    await page.goto('/login.html');

    // Check page title
    await expect(page).toHaveTitle(/Login|PE OS/);

    // Check email input exists
    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toBeVisible();

    // Check password input exists
    const passwordInput = page.locator('input[type="password"]');
    await expect(passwordInput).toBeVisible();

    // Check submit button exists
    const submitButton = page.locator('button[type="submit"]');
    await expect(submitButton).toBeVisible();
  });

  test('should have forgot password link', async ({ page }) => {
    await page.goto('/login.html');

    const forgotLink = page.locator('a[href*="forgot-password"]');
    await expect(forgotLink).toBeVisible();
  });

  test('should have signup link', async ({ page }) => {
    await page.goto('/login.html');

    const signupLink = page.locator('a[href*="signup"]');
    await expect(signupLink).toBeVisible();
  });

  test('should show error for empty form submission', async ({ page }) => {
    await page.goto('/login.html');

    // Click submit without entering data
    const submitButton = page.locator('button[type="submit"]');
    await submitButton.click();

    // Form should show validation (browser native or custom)
    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toHaveAttribute('required');
  });
});

test.describe('Signup Page', () => {
  test('should load the signup page', async ({ page }) => {
    await page.goto('/signup.html');

    // Check page title
    await expect(page).toHaveTitle(/Signup|Registration|PE OS/);

    // Check form fields exist
    await expect(page.locator('input[id="fullname"]')).toBeVisible();
    await expect(page.locator('input[id="email"]')).toBeVisible();
    await expect(page.locator('input[id="password"]')).toBeVisible();
    await expect(page.locator('input[id="firmname"]')).toBeVisible();
  });

  test('should have password strength indicator', async ({ page }) => {
    await page.goto('/signup.html');

    // Type in password field
    const passwordInput = page.locator('input[id="password"]');
    await passwordInput.fill('TestPass123');

    // Password strength indicator should appear
    const strengthIndicator = page.locator('#passwordStrength');
    await expect(strengthIndicator).toBeVisible();
  });

  test('should validate password confirmation', async ({ page }) => {
    await page.goto('/signup.html');

    // Fill passwords that don't match
    await page.locator('input[id="password"]').fill('TestPass123');
    await page.locator('input[id="confirm_password"]').fill('DifferentPass');

    // Check password match message
    const matchMessage = page.locator('#passwordMatch');
    await expect(matchMessage).toBeVisible();
    await expect(matchMessage).toContainText(/do not match/i);
  });
});

test.describe('Forgot Password Page', () => {
  test('should load the forgot password page', async ({ page }) => {
    await page.goto('/forgot-password.html');

    // Check email input exists
    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toBeVisible();

    // Check submit button exists
    const submitButton = page.locator('button[type="submit"]');
    await expect(submitButton).toBeVisible();
  });
});

test.describe('Page Navigation', () => {
  test('should navigate from login to signup', async ({ page }) => {
    await page.goto('/login.html');

    // Click signup link
    const signupLink = page.locator('a[href*="signup"]');
    await signupLink.click();

    // Should be on signup page
    await expect(page).toHaveURL(/signup/);
  });

  test('should navigate from signup to login', async ({ page }) => {
    await page.goto('/signup.html');

    // Click login link
    const loginLink = page.locator('a[href*="login"]');
    await loginLink.click();

    // Should be on login page
    await expect(page).toHaveURL(/login/);
  });
});

test.describe('Responsive Design', () => {
  test('should be responsive on mobile viewport', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/login.html');

    // Login form should still be visible
    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toBeVisible();

    // Submit button should be tappable
    const submitButton = page.locator('button[type="submit"]');
    await expect(submitButton).toBeVisible();
  });

  test('should be responsive on tablet viewport', async ({ page }) => {
    // Set tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });

    await page.goto('/login.html');

    // Login form should still be visible
    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toBeVisible();
  });
});

test.describe('Accessibility', () => {
  test('should have proper form labels', async ({ page }) => {
    await page.goto('/login.html');

    // Email input should have a label
    const emailLabel = page.locator('label[for="email"]');
    await expect(emailLabel).toBeVisible();

    // Password input should have a label
    const passwordLabel = page.locator('label[for="password"]');
    await expect(passwordLabel).toBeVisible();
  });

  test('should support keyboard navigation', async ({ page }) => {
    await page.goto('/login.html');

    // Tab to email input
    await page.keyboard.press('Tab');

    // Email input should be focused
    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toBeFocused();

    // Tab to password input
    await page.keyboard.press('Tab');

    // Password input should be focused
    const passwordInput = page.locator('input[type="password"]');
    await expect(passwordInput).toBeFocused();
  });
});
