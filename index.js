const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static('public'));

let tempAccount = null;
let lastAccount = null; // 💾 lưu bản sao email cũ
let token = null;
let messages = [];

// Thời gian chờ tối thiểu trước khi thử lại (ví dụ: 3 giây)
const RETRY_DELAY = 3000; // 3 giây

// Hàm tạo email tạm thời
async function createTempEmail() {
  try {
    const domainRes = await axios.get('https://api.mail.tm/domains');
    const domain = domainRes.data['hydra:member'][0].domain;

    const random = Math.random().toString(36).substring(2, 10);
    const email = `${random}@${domain}`;
    const password = 'TestPassword123!';

    await axios.post('https://api.mail.tm/accounts', {
      address: email,
      password,
    });

    const tokenRes = await axios.post('https://api.mail.tm/token', {
      address: email,
      password,
    });

    return {
      email,
      password,
      token: tokenRes.data.token,
    };
  } catch (error) {
    if (error.response && error.response.status === 429) {
      // Nếu gặp lỗi 429, chờ một thời gian và thử lại
      return { error: "Quá nhiều yêu cầu, vui lòng thử lại sau vài giây." }; // Trả về thông báo lỗi
    } else {
      throw error; // Ném lỗi khác lên
    }
  }
}

// Lấy danh sách thư
async function fetchInbox() {
  if (!token) return [];

  const res = await axios.get('https://api.mail.tm/messages', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return res.data['hydra:member'];
}

// Trang chính
app.get('/', async (req, res) => {
  if (!tempAccount) {
    // Nếu chưa có tài khoản tạm thời, tạo mới
    const result = await createTempEmail();
    if (result.error) {
      return res.render('email', {
        email: null,
        messages: [],
        error: result.error, // Gửi thông báo lỗi lên trang
      });
    }
    tempAccount = result;
    token = tempAccount.token;
  }

  messages = await fetchInbox();

  res.render('email', {
    email: tempAccount.email,
    messages,
    error: null, // Không có lỗi khi tạo email thành công
  });
});

// Làm mới hộp thư
app.get('/inbox', async (req, res) => {
  if (!tempAccount) return res.redirect('/');
  messages = await fetchInbox();
  res.redirect('/');
});

// Lấy email mới
app.get('/new-email', async (req, res) => {
  if (tempAccount) {
    // 💾 Lưu lại email cũ
    lastAccount = { ...tempAccount, token };
  }

  const result = await createTempEmail();
  if (result.error) {
    return res.render('email', {
      email: null,
      messages: [],
      error: result.error, // Gửi thông báo lỗi lên trang
    });
  }

  tempAccount = { email: result.email, password: result.password };
  token = result.token;
  messages = await fetchInbox();
  res.redirect('/');
});

// Khôi phục email cũ
app.get('/restore', async (req, res) => {
  if (!lastAccount) {
    return res.send('<h3>⚠️ Không có email cũ để khôi phục.</h3><a href="/">Quay lại</a>');
  }

  // 🔁 Khôi phục lại biến
  tempAccount = { email: lastAccount.email, password: lastAccount.password };
  token = lastAccount.token;
  messages = await fetchInbox();

  res.redirect('/');
});

// Xem nội dung chi tiết 1 email
app.get('/email/:id', async (req, res) => {
  const emailId = req.params.id;

  try {
    const detail = await axios.get(`https://api.mail.tm/messages/${emailId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    res.send(`
      <h2>${detail.data.subject}</h2>
      <p><strong>From:</strong> ${detail.data.from.address}</p>
      <hr>
      <div>${detail.data.html || detail.data.text}</div>
      <a href="/">⬅️ Quay lại</a>
    `);
  } catch (err) {
    res.send('Không thể đọc email này.');
  }
});

app.listen(PORT, () => {
  console.log(`📬 Server đang chạy tại http://localhost:${PORT}`);
});
