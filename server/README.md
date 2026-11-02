# ServeSmart Backend API

A comprehensive backend API for the ServeSmart Point of Sale (POS) system built with Node.js, Express.js, and TypeScript.

## Features

- **Authentication & Authorization**: JWT-based authentication with role-based access control
- **Menu Management**: CRUD operations for menu items with categories and availability
- **Order Management**: Complete order lifecycle from creation to payment
- **Table Management**: Table status tracking and management
- **User Management**: Staff and admin user management
- **Data Validation**: Comprehensive input validation using express-validator
- **Error Handling**: Centralized error handling and logging
- **TypeScript**: Full TypeScript support for type safety

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user

### Menu
- `GET /api/menu` - Get all menu items
- `GET /api/menu/:id` - Get single menu item
- `POST /api/menu` - Create menu item (Admin/Manager)
- `PUT /api/menu/:id` - Update menu item (Admin/Manager)
- `DELETE /api/menu/:id` - Delete menu item (Admin)

### Orders
- `GET /api/orders` - Get all orders
- `GET /api/orders/:id` - Get single order
- `POST /api/orders` - Create new order
- `PUT /api/orders/:id/status` - Update order status
- `PUT /api/orders/:id/payment` - Update payment status

### Tables
- `GET /api/tables` - Get all tables
- `GET /api/tables/:id` - Get single table
- `POST /api/tables` - Create table (Admin/Manager)
- `PUT /api/tables/:id` - Update table (Admin/Manager)
- `PUT /api/tables/:id/status` - Update table status
- `DELETE /api/tables/:id` - Delete table (Admin)

### Users
- `GET /api/users` - Get all users (Admin/Manager)
- `GET /api/users/:id` - Get single user (Admin/Manager)
- `PUT /api/users/:id` - Update user (Admin/Manager)
- `PUT /api/users/:id/password` - Update password (Admin/Manager)
- `DELETE /api/users/:id` - Delete user (Admin)

## Installation

1. Install dependencies:
```bash
npm install
```

2. Create environment file:
```bash
cp .env.example .env
```

3. Update environment variables in `.env` file

4. Start development server:
```bash
npm run dev
```

5. Build for production:
```bash
npm run build
npm start
```

## Environment Variables

- `PORT` - Server port (default: 5000)
- `NODE_ENV` - Environment (development/production)
- `MONGODB_URI` - MongoDB connection string
- `JWT_SECRET` - JWT secret key
- `JWT_EXPIRE` - JWT expiration time
- `FRONTEND_URL` - Frontend URL for CORS

## Database

This API uses MongoDB with Mongoose ODM. Make sure MongoDB is running before starting the server.

## Development

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Start production server
- `npm test` - Run tests

## License

MIT
