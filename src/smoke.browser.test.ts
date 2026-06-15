import { getByRole, getByText } from '@testing-library/dom';
import { userEvent } from '@testing-library/user-event';
import { afterEach, expect, test } from 'vitest';

// Smoke test proving the UI toolchain works end-to-end in a real browser:
// real DOM rendering, Testing Library queries, user-event interaction and
// jest-dom matchers. Real UI components are tested the same way.

afterEach(() => {
  document.body.innerHTML = '';
});

test('renders a button and responds to a real click', async () => {
  const container = document.createElement('div');
  container.innerHTML = `
    <button type="button">Confirm</button>
    <output></output>
  `;
  document.body.append(container);

  const button = getByRole(container, 'button', { name: 'Confirm' });
  const output = container.querySelector('output')!;
  button.addEventListener('click', () => {
    output.textContent = 'clicked';
  });

  expect(button).toBeVisible();

  await userEvent.click(button);

  expect(getByText(container, 'clicked')).toBeInTheDocument();
});
