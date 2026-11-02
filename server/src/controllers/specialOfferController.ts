import { Request, Response } from 'express';
import SpecialOffer from '../models/SpecialOffer';

export const createOffer = async (req: Request, res: Response) => {
  try {
    const { offerName, percentage, endDate } = req.body;
    
    const createdBy = "Admin User"; 

    if (!offerName || percentage === undefined) {
      return res.status(400).json({ 
        success: false, 
        message: "Offer Name and Percentage are mandatory." 
      });
    }

    const newOffer = new SpecialOffer({
      offerName,
      percentage,
      endDate,
      createdBy,
      status: 'Active'
    });

    await newOffer.save();
    
    return res.status(201).json({ 
      success: true, 
      message: "Offer created successfully!", 
      data: newOffer 
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getOffers = async (req: Request, res: Response) => {
  try {
    const offers = await SpecialOffer.find({ status: { $ne: 'Disabled' } }).sort({ createdAt: -1 });
    
    if (!offers || offers.length === 0) {
      return res.status(200).json({ success: true, data: [] });
    }

    const updatedOffers = offers.map(offer => {
      const today = new Date();
      if (offer.endDate && new Date(offer.endDate) < today && offer.status === 'Active') {
        offer.status = 'Expired';
      }
      return offer;
    });

    return res.status(200).json({ success: true, data: updatedOffers });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const updateOffer = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const updatedOffer = await SpecialOffer.findByIdAndUpdate(
      id,
      { $set: req.body },
      { new: true, runValidators: true }
    );

    if (!updatedOffer) {
      return res.status(404).json({ success: false, message: "Offer not found." });
    }

    return res.status(200).json({ 
      success: true, 
      message: "Update successful!", 
      data: updatedOffer 
    });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
};
export const deleteOffer = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const deletedOffer = await SpecialOffer.findByIdAndDelete(id);

    if (!deletedOffer) {
      return res.status(404).json({ success: false, message: "Offer not found." });
    }

    return res.status(200).json({
      success: true,
      message: "Offer deleted successfully!"
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};