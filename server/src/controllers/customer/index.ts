import { Request, Response } from 'express';
import { body, param } from 'express-validator';
import Customer from '../../models/Customer';
import { authenticate } from '../../middleware/auth';
import multer from 'multer';
import * as XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'customer-import-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedExtensions = ['.xlsx', '.xls', '.csv'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only Excel (.xlsx, .xls) and CSV files are allowed.'));
    }
  }
});

export const uploadMiddleware = upload.single('file');

// Get all customers
export const getCustomers = [
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const q = (req.query.q as string) || '';
      const filter: any = {};
      
      // Search functionality - search by name, mobile, or NIC
      if (q) {
        filter.$or = [
          { name: { $regex: q, $options: 'i' } },
          { mobile: { $regex: q, $options: 'i' } },
          { NIC: { $regex: q, $options: 'i' } }
        ];
      }
      
      const list = await Customer.find(filter).sort({ createdAt: -1 });
      res.json({ status: 'success', data: list });
      return;
    } catch (e: any) {
      res.status(500).json({ status: 'error', message: 'Failed to fetch customers' });
      return;
    }
  }
];

// Get customer by ID
export const getCustomerById = [
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const found = await Customer.findById(req.params.id);
      if (!found) { 
        res.status(404).json({ status: 'error', message: 'Customer not found' }); 
        return; 
      }
      res.json({ status: 'success', data: found });
      return;
    } catch (e: any) {
      res.status(500).json({ status: 'error', message: 'Failed to fetch customer' });
      return;
    }
  }
];

// Validation helper functions
const validateMobile = (mobile: string): boolean => {
  // Format: 0XXXXXXXXX (10 digits starting with 0) or +94XXXXXXXXX (12 characters starting with +94)
  const mobileRegex = /^(0\d{9}|\+94\d{9})$/;
  return mobileRegex.test(mobile.trim());
};

const validateNIC = (nic: string): boolean => {
  if (!nic || nic.trim() === '') return true; // NIC is optional
  const trimmedNIC = nic.trim();
  // Format: 12 digits OR 9 digits + V/v
  const nicRegex = /^(\d{12}|\d{9}[Vv])$/;
  return nicRegex.test(trimmedNIC);
};

// Create customer validators
export const createCustomerValidators = [
  authenticate,
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('mobile').trim().notEmpty().withMessage('Mobile is required'),
  body('NIC').optional().isString().withMessage('NIC must be a string'),
  body('address').optional().isString().withMessage('Address must be a string')
];

// Create customer
export const createCustomer = [
  async (req: Request, res: Response): Promise<void> => {
    try {
      let { name, mobile, NIC, address } = req.body;
      
      // Trim and validate mobile
      mobile = mobile.trim();
      if (!validateMobile(mobile)) {
        res.status(400).json({ 
          status: 'error', 
          message: 'Invalid mobile number format. Use 0XXXXXXXXX or +94XXXXXXXXX' 
        });
        return;
      }
      
      // Trim, validate and normalize NIC
      if (NIC) {
        NIC = NIC.trim();
        if (!validateNIC(NIC)) {
          res.status(400).json({ 
            status: 'error', 
            message: 'Invalid NIC format. Use 12 digits or 9 digits followed by V' 
          });
          return;
        }
        // Convert 'v' to uppercase
        NIC = NIC.toUpperCase();
      }
      
      // Check if customer with same mobile already exists
      const exists = await Customer.findOne({ mobile });
      if (exists) { 
        res.status(409).json({ status: 'error', message: 'Customer with this mobile number already exists' }); 
        return; 
      }
      
      const created = await Customer.create({ name, mobile, NIC, address });
      res.status(201).json({ status: 'success', message: 'Customer created successfully', data: created });
      return;
    } catch (e: any) {
      res.status(500).json({ status: 'error', message: 'Failed to create customer' });
      return;
    }
  }
];

// Update customer validators
export const updateCustomerValidators = [
  authenticate,
  param('id').isMongoId().withMessage('Invalid customer id'),
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
  body('mobile').optional().trim().notEmpty().withMessage('Mobile cannot be empty'),
  body('NIC').optional().isString(),
  body('address').optional().isString()
];

// Update customer
export const updateCustomer = [
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params as any;
      const payload: any = {};
      const unsetFields: any = {};
      
      // Handle name
      if (req.body.name !== undefined) {
        payload.name = req.body.name.trim();
      }
      
      // Handle mobile
      if (req.body.mobile !== undefined) {
        payload.mobile = req.body.mobile.trim();
        if (!validateMobile(payload.mobile)) {
          res.status(400).json({ 
            status: 'error', 
            message: 'Invalid mobile number format. Use 0XXXXXXXXX or +94XXXXXXXXX' 
          });
          return;
        }
        
        // Check for duplicate mobile
        const dup = await Customer.findOne({ _id: { $ne: id }, mobile: payload.mobile });
        if (dup) { 
          res.status(409).json({ status: 'error', message: 'Another customer with this mobile number already exists' }); 
          return; 
        }
      }
      
      // Handle NIC - null means remove, empty string means remove, otherwise validate and normalize
      if (req.body.NIC !== undefined) {
        if (req.body.NIC === null || req.body.NIC === '' || (typeof req.body.NIC === 'string' && req.body.NIC.trim() === '')) {
          unsetFields.NIC = '';
        } else {
          const nicStr = typeof req.body.NIC === 'string' ? req.body.NIC.trim() : String(req.body.NIC).trim();
          if (!validateNIC(nicStr)) {
            res.status(400).json({ 
              status: 'error', 
              message: 'Invalid NIC format. Use 12 digits or 9 digits followed by V' 
            });
            return;
          }
          // Convert 'v' to uppercase
          payload.NIC = nicStr.toUpperCase();
        }
      }
      
      // Handle address - null means remove, empty string means remove
      if (req.body.address !== undefined) {
        if (req.body.address === null || req.body.address === '' || (typeof req.body.address === 'string' && req.body.address.trim() === '')) {
          unsetFields.address = '';
        } else {
          payload.address = typeof req.body.address === 'string' ? req.body.address.trim() : String(req.body.address).trim();
        }
      }
      
      // Build update query
      const updateQuery: any = {};
      if (Object.keys(payload).length > 0) {
        updateQuery.$set = payload;
      }
      if (Object.keys(unsetFields).length > 0) {
        updateQuery.$unset = unsetFields;
      }
      
      const updated = await Customer.findByIdAndUpdate(id, updateQuery, { new: true });
      if (!updated) { 
        res.status(404).json({ status: 'error', message: 'Customer not found' }); 
        return; 
      }
      res.json({ status: 'success', message: 'Customer updated successfully', data: updated });
      return;
    } catch (e: any) {
      res.status(500).json({ status: 'error', message: 'Failed to update customer' });
      return;
    }
  }
];

// Delete customer validators
export const deleteCustomerValidators = [
  authenticate,
  param('id').isMongoId().withMessage('Invalid customer id')
];

// Delete customer
export const deleteCustomer = [
  async (req: Request, res: Response): Promise<void> => {
    try {
      const deleted = await Customer.findByIdAndDelete(req.params.id);
      if (!deleted) { 
        res.status(404).json({ status: 'error', message: 'Customer not found' }); 
        return; 
      }
      res.json({ status: 'success', message: 'Customer deleted successfully' });
      return;
    } catch (e: any) {
      res.status(500).json({ status: 'error', message: 'Failed to delete customer' });
      return;
    }
  }
];

// Download template
export const downloadTemplate = [
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    try {
      // Create sample data
      const sampleData = [
        {
          'Name': 'John Doe',
          'Mobile': '0771234567',
          'NIC': '123456789V',
          'Address': '123 Main Street, Colombo'
        },
        {
          'Name': 'Jane Smith',
          'Mobile': '0779876543',
          'NIC': '987654321V',
          'Address': '456 Park Avenue, Kandy'
        }
      ];

      // Create workbook and worksheet
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(sampleData);
      
      // Set column widths
      ws['!cols'] = [
        { wch: 20 }, // Name
        { wch: 15 }, // Mobile
        { wch: 15 }, // NIC
        { wch: 40 }  // Address
      ];

      XLSX.utils.book_append_sheet(wb, ws, 'Customers');

      // Generate buffer
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      // Set headers
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=customer-import-template.xlsx');
      
      res.send(buffer);
      return;
    } catch (e: any) {
      res.status(500).json({ status: 'error', message: 'Failed to generate template' });
      return;
    }
  }
];

// Import customers
export const importCustomers = [
  authenticate,
  uploadMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({ status: 'error', message: 'No file uploaded' });
        return;
      }

      const filePath = req.file.path;
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet);

      const results = {
        success: 0,
        failed: 0,
        errors: [] as string[]
      };

      // Process each row
      for (let i = 0; i < data.length; i++) {
        const row = data[i] as any;
        const rowNum = i + 2; // +2 because row 1 is header and arrays are 0-indexed

        try {
          // Normalize column names (case-insensitive, handle spaces)
          const name = row['Name'] || row['name'] || row['NAME'] || '';
          const mobile = row['Mobile'] || row['mobile'] || row['MOBILE'] || '';
          const nic = row['NIC'] || row['nic'] || row['Nic'] || '';
          const address = row['Address'] || row['address'] || row['ADDRESS'] || '';

          // Validate required fields
          if (!name || !name.toString().trim()) {
            results.errors.push(`Row ${rowNum}: Name is required`);
            results.failed++;
            continue;
          }

          const mobileStr = mobile ? mobile.toString().trim() : '';
          if (!mobileStr) {
            results.errors.push(`Row ${rowNum}: Mobile is required`);
            results.failed++;
            continue;
          }

          // Validate mobile format
          if (!validateMobile(mobileStr)) {
            results.errors.push(`Row ${rowNum}: Invalid mobile format. Use 0XXXXXXXXX or +94XXXXXXXXX`);
            results.failed++;
            continue;
          }

          // Validate and normalize NIC
          let processedNIC: string | undefined = undefined;
          if (nic) {
            const nicStr = nic.toString().trim();
            if (nicStr) {
              if (!validateNIC(nicStr)) {
                results.errors.push(`Row ${rowNum}: Invalid NIC format. Use 12 digits or 9 digits followed by V`);
                results.failed++;
                continue;
              }
              // Convert 'v' to uppercase
              processedNIC = nicStr.toUpperCase();
            }
          }

          // Check if customer with same mobile already exists
          const exists = await Customer.findOne({ mobile: mobileStr });
          if (exists) {
            results.errors.push(`Row ${rowNum}: Customer with mobile ${mobileStr} already exists`);
            results.failed++;
            continue;
          }

          // Create customer
          await Customer.create({
            name: name.toString().trim(),
            mobile: mobileStr,
            NIC: processedNIC,
            address: address ? address.toString().trim() : undefined
          });

          results.success++;
        } catch (error: any) {
          results.errors.push(`Row ${rowNum}: ${error.message || 'Unknown error'}`);
          results.failed++;
        }
      }

      // Clean up uploaded file
      try {
        fs.unlinkSync(filePath);
      } catch (unlinkError) {
        console.error('Failed to delete uploaded file:', unlinkError);
      }

      res.json({
        status: 'success',
        message: `Import completed. ${results.success} customers imported, ${results.failed} failed.`,
        data: {
          success: results.success,
          failed: results.failed,
          errors: results.errors
        }
      });
      return;
    } catch (e: any) {
      // Clean up uploaded file on error
      if (req.file) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (unlinkError) {
          console.error('Failed to delete uploaded file:', unlinkError);
        }
      }
      res.status(500).json({ status: 'error', message: 'Failed to import customers' });
      return;
    }
  }
];


