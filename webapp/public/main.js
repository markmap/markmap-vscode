/**************************************************
 * main.js - Client-side logic for index.html
 *************************************************/
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('prompt-form');
    const promptInput = document.getElementById('promptInput');
    const statusMessage = document.getElementById('statusMessage');
  
    // Handle form submission: POST /generate with { prompt }
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const prompt = promptInput.value.trim();
      if (!prompt) {
        alert('Please enter a prompt first');
        return;
      }
      statusMessage.textContent = 'Generating mindmap... Please wait.';
  
      try {
        const response = await fetch('/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt }),
        });
        const data = await response.json();
        if (data.success) {
          statusMessage.textContent = 'Mindmap generated successfully!';
        } else {
          statusMessage.textContent = 'Error: ' + data.error;
        }
      } catch (err) {
        console.error(err);
        statusMessage.textContent = 'Request failed.';
      }
    });
  
    /********************************************
     * Loading + Editing mindmap.md
     ********************************************/
    const loadButton = document.getElementById('load-md');
    const saveButton = document.getElementById('save-md');
    const mdEditor = document.getElementById('md-editor');
  
    // Load the existing mindmap.md into the textarea
    loadButton.addEventListener('click', async () => {
      statusMessage.textContent = 'Loading mindmap.md ...';
      try {
        const response = await fetch('/mindmap.md');
        if (!response.ok)
          throw new Error(`Could not fetch mindmap.md: ${response.statusText}`);
        const mdContent = await response.text();
        mdEditor.value = mdContent;
        statusMessage.textContent = 'Loaded mindmap.md into editor.';
      } catch (err) {
        console.error(err);
        statusMessage.textContent = 'Failed to load mindmap.md.';
      }
    });
  
    // Save the current textarea content to mindmap.md, then re-run convert.js
    saveButton.addEventListener('click', async () => {
      const updatedMD = mdEditor.value;
      if (!updatedMD) {
        alert('mindmap.md is empty. Nothing to save.');
        return;
      }
      statusMessage.textContent = 'Saving mindmap.md and reconverting...';
  
      try {
        const resp = await fetch('/save-md', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mdContent: updatedMD }),
        });
        const data = await resp.json();
        if (data.success) {
          statusMessage.textContent = 'mindmap.md updated! mindmap.html re-generated!';
        } else {
          statusMessage.textContent = 'Error: ' + data.error;
        }
      } catch (err) {
        console.error(err);
        statusMessage.textContent = 'Save failed.';
      }
    });
  });
  