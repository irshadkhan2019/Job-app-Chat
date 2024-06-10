import { ConversationModel } from '@chat/models/conversation.schema';
import { MessageModel } from '@chat/models/message.schema';
import { publishDirectMessage } from '@chat/queues/message.producer';
import { chatChannel, socketIOChatObject } from '@chat/Server';
import { IConversationDocument, IMessageDetails, IMessageDocument, lowerCase } from '@irshadkhan2019/job-app-shared';

// created only once b/w 2 users
const createConversation = async (conversationId: string, sender: string, receiver: string): Promise<void> => {
  await ConversationModel.create({
    conversationId,
    senderUsername: sender,
    receiverUsername: receiver
  });
};


const addMessage = async (data: IMessageDocument): Promise<IMessageDocument> => {
    // save msg to db
  const message: IMessageDocument = await MessageModel.create(data) as IMessageDocument;
//   if message has offer we need to mail offer
  if (data.hasOffer) {
    const emailMessageDetails: IMessageDetails = {
      sender: data.senderUsername,
      amount: `${data.offer?.price}`,
      buyerUsername: lowerCase(`${data.receiverUsername}`),
      sellerUsername: lowerCase(`${data.senderUsername}`),
      title: data.offer?.gigTitle,
      description: data.offer?.description,
      deliveryDays: `${data.offer?.deliveryInDays}`,
      template: 'offer'
    };
    // send email
    await publishDirectMessage(
      chatChannel,
      'jobber-order-notification',
      'order-email',
      JSON.stringify(emailMessageDetails),
      'Order email sent to notification service.'
    );
  }
 //   send msg to api gateway via socket conn
  socketIOChatObject.emit('message received', message);
  return message;
};

const getConversation = async (sender: string, receiver: string): Promise<IConversationDocument[]> => {
  const query = {
    $or: [
      { senderUsername: sender, receiverUsername: receiver },
      { senderUsername: receiver, receiverUsername: sender },
    ]
  };
  const conversation: IConversationDocument[] = await ConversationModel.aggregate([{ $match: query }]);
  return conversation;
};

// gives all conversations for an user
const getUserConversationList = async (username: string): Promise<IMessageDocument[]> => {
  const query = {
    $or: [
      { senderUsername: username },
      { receiverUsername: username },
    ]
  };
  const messages: IMessageDocument[] = await MessageModel.aggregate([
    { $match: query },  //gives all messages where username user exists
    {
      $group: { //group those msgs based on conversation id and get last msg from each conversation
        _id: '$conversationId',
        result: { $top: { output: '$$ROOT', sortBy: { createdAt: -1 }}}
      }
    },
    { 
      $project: { //That last msg of each conversation must have theses properties .
        _id: '$result._id',
        conversationId: '$result.conversationId',
        sellerId: '$result.sellerId',
        buyerId: '$result.buyerId',
        receiverUsername: '$result.receiverUsername',
        receiverPicture: '$result.receiverPicture',
        senderUsername: '$result.senderUsername',
        senderPicture: '$result.senderPicture',
        body: '$result.body',
        file: '$result.file',
        gigId: '$result.gigId',
        isRead: '$result.isRead',
        hasOffer: '$result.hasOffer',
        createdAt: '$result.createdAt'
      }
    }
  ]);
//   if user had chat with 3 other users we get messages with 3 msgs where these 3 msgs are last mesg in the messageModel
  return messages;
};

//gets all messages in an conversation
const getMessages = async (sender: string, receiver: string): Promise<IMessageDocument[]> => {
  const query = {
    $or: [
      { senderUsername: sender, receiverUsername: receiver },
      { senderUsername: receiver, receiverUsername: sender },
    ]
  };
  const messages: IMessageDocument[] = await MessageModel.aggregate([
    { $match: query },//gets all messages in an conversation
    { $sort: { createdAt: 1 }} //oldest to newest sorted
  ]);
  return messages;
};

//gets all messages in an conversation
const getUserMessages = async (messageConversationId: string): Promise<IMessageDocument[]> => {
  const messages: IMessageDocument[] = await MessageModel.aggregate([
    { $match: { conversationId: messageConversationId } },
    { $sort: { createdAt: 1 }}
  ]);
  return messages;
};

// inside msg we have offer which has accepted/rejected fields based on that update msg what buyer choses.
// type =accepted/cancelled
const updateOffer = async (messageId: string, type: string): Promise<IMessageDocument> => {
  const message: IMessageDocument = await MessageModel.findOneAndUpdate(
    { _id: messageId },
    {
      $set: {
        [`offer.${type}`]: true
      }
    },
    { new: true } //return new updated doc
  ) as IMessageDocument;
  return message;
};

const markMessageAsRead = async (messageId: string): Promise<IMessageDocument> => {
  const message: IMessageDocument = await MessageModel.findOneAndUpdate(
    { _id: messageId },
    {
      $set: {
        isRead: true
      }
    },
    { new: true }
  ) as IMessageDocument;
//   send updates to api gateway about update
  socketIOChatObject.emit('message updated', message);
  return message;
};

const markManyMessagesAsRead = async (receiver: string, sender: string, messageId: string): Promise<IMessageDocument> => {
  await MessageModel.updateMany(
    { senderUsername: sender, receiverUsername: receiver, isRead: false },
    {
      $set: {
        isRead: true
      }
    },
  ) as IMessageDocument;
  const message: IMessageDocument = await MessageModel.findOne({ _id: messageId }).exec() as IMessageDocument;
  socketIOChatObject.emit('message updated', message);
  return message;
};

export {
  createConversation,
  addMessage,
  getConversation,
  getUserConversationList,
  getMessages,
  getUserMessages,
  updateOffer,
  markMessageAsRead,
  markManyMessagesAsRead
};